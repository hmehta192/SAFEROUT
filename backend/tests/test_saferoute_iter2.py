"""SafeRoute iteration-2 additions: driver unavailable, admin alerts feed, parent live info."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set"
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = "+919000000001"
DRIVER = "+919000000002"
PARENT1 = "+919000000003"
PARENT2 = "+919000000004"


def login(phone: str) -> dict:
    r = requests.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=15)
    assert r.status_code == 200, r.text
    otp = r.json()["dev_otp"]
    r = requests.post(f"{API}/auth/verify-otp", json={"phone": phone, "otp": otp}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def h(ctx):
    return {"Authorization": f"Bearer {ctx['token']}"}


@pytest.fixture(scope="module")
def admin_ctx():
    return login(ADMIN)


@pytest.fixture(scope="module")
def driver_ctx():
    return login(DRIVER)


@pytest.fixture(scope="module")
def parent1_ctx():
    return login(PARENT1)


@pytest.fixture(scope="module")
def parent2_ctx():
    return login(PARENT2)


def _cleanup_trip(driver_ctx):
    requests.post(f"{API}/driver/trips/end", headers=h(driver_ctx), timeout=10)


# --------------------- Driver: batch selection required ---------------------
class TestStartTripRequiresBatch:
    def test_start_missing_batch_id_422(self, driver_ctx):
        _cleanup_trip(driver_ctx)
        r = requests.post(f"{API}/driver/trips/start", json={}, headers=h(driver_ctx), timeout=10)
        assert r.status_code == 422  # Pydantic validation

    def test_start_unknown_batch_404(self, driver_ctx):
        _cleanup_trip(driver_ctx)
        r = requests.post(f"{API}/driver/trips/start",
                          json={"batch_id": "nonexistent"}, headers=h(driver_ctx), timeout=10)
        assert r.status_code == 404

    def test_start_valid_batch_ok(self, driver_ctx):
        _cleanup_trip(driver_ctx)
        batches = requests.get(f"{API}/driver/batches", headers=h(driver_ctx), timeout=10).json()
        r = requests.post(f"{API}/driver/trips/start",
                          json={"batch_id": batches[0]["id"]}, headers=h(driver_ctx), timeout=10)
        assert r.status_code == 200
        assert r.json()["batch_id"] == batches[0]["id"]
        _cleanup_trip(driver_ctx)


# --------------------- Driver: GPS auto-start (location endpoint) ---------------------
class TestDriverLocation:
    def test_location_updates_and_moves_to_on_the_way(self, driver_ctx):
        _cleanup_trip(driver_ctx)
        batches = requests.get(f"{API}/driver/batches", headers=h(driver_ctx), timeout=10).json()
        bid = batches[0]["id"]
        requests.post(f"{API}/driver/trips/start", json={"batch_id": bid},
                      headers=h(driver_ctx), timeout=10)
        r = requests.post(f"{API}/driver/trips/location",
                          json={"lat": 12.9500, "lng": 77.5800}, headers=h(driver_ctx), timeout=10)
        assert r.status_code == 200
        active = requests.get(f"{API}/driver/active-trip", headers=h(driver_ctx), timeout=10).json()
        assert active is not None
        assert active["current_lat"] == 12.9500
        assert active["status"] == "on_the_way"
        _cleanup_trip(driver_ctx)

    def test_location_no_active_trip_404(self, driver_ctx):
        _cleanup_trip(driver_ctx)
        r = requests.post(f"{API}/driver/trips/location",
                          json={"lat": 12.9, "lng": 77.6}, headers=h(driver_ctx), timeout=10)
        assert r.status_code == 404


# --------------------- Driver: mark unavailable ---------------------
class TestDriverUnavailable:
    def test_empty_reason_400(self, driver_ctx):
        _cleanup_trip(driver_ctx)
        batches = requests.get(f"{API}/driver/batches", headers=h(driver_ctx), timeout=10).json()
        bid = batches[0]["id"]
        r = requests.post(f"{API}/driver/batches/{bid}/unavailable",
                          json={"reason": "   "}, headers=h(driver_ctx), timeout=10)
        assert r.status_code == 400

    def test_unknown_batch_404(self, driver_ctx):
        r = requests.post(f"{API}/driver/batches/does-not-exist/unavailable",
                          json={"reason": "Sick"}, headers=h(driver_ctx), timeout=10)
        assert r.status_code == 404

    def test_role_guard_parent_cannot_call(self, parent1_ctx, driver_ctx):
        batches = requests.get(f"{API}/driver/batches", headers=h(driver_ctx), timeout=10).json()
        bid = batches[0]["id"]
        r = requests.post(f"{API}/driver/batches/{bid}/unavailable",
                          json={"reason": "x"}, headers=h(parent1_ctx), timeout=10)
        assert r.status_code == 403

    def test_unavailable_ends_active_trip_and_notifies_all(
        self, driver_ctx, parent1_ctx, parent2_ctx, admin_ctx
    ):
        _cleanup_trip(driver_ctx)
        # pick the batch that has students of parent1 or parent2
        batches = requests.get(f"{API}/driver/batches", headers=h(driver_ctx), timeout=10).json()
        target = None
        for b in batches:
            if b["students"]:
                target = b
                break
        assert target, "need a batch with students"
        bid = target["id"]

        # start a trip on that batch
        r = requests.post(f"{API}/driver/trips/start", json={"batch_id": bid},
                          headers=h(driver_ctx), timeout=10)
        assert r.status_code == 200

        # baseline admin alert count
        before_admin = len(requests.get(f"{API}/admin/alerts",
                                        headers=h(admin_ctx), timeout=10).json())

        reason = f"TEST_unavailable_{int(time.time())}"
        r = requests.post(f"{API}/driver/batches/{bid}/unavailable",
                          json={"reason": reason}, headers=h(driver_ctx), timeout=10)
        assert r.status_code == 200, r.text

        # active trip should be ended
        active = requests.get(f"{API}/driver/active-trip",
                              headers=h(driver_ctx), timeout=10).json()
        assert active is None

        # admin got a driver_unavailable alert with the reason
        admin_alerts = requests.get(f"{API}/admin/alerts",
                                    headers=h(admin_ctx), timeout=10).json()
        assert len(admin_alerts) > before_admin
        assert any(a["type"] == "driver_unavailable" and reason in a["message"]
                   for a in admin_alerts)

        # relevant parent(s) got the alert
        student_parents = {s["parent_id"] for s in target["students"]}
        for pctx, phone in ((parent1_ctx, PARENT1), (parent2_ctx, PARENT2)):
            me = requests.get(f"{API}/auth/me", headers=h(pctx), timeout=10).json()
            pa = requests.get(f"{API}/parent/alerts",
                              headers=h(pctx), timeout=10).json()
            if me["id"] in student_parents:
                assert any(a["type"] == "driver_unavailable" and reason in a["message"]
                           for a in pa), f"parent {phone} missing unavailable alert"

        # parent/trips reflects unavailability
        pt = requests.get(f"{API}/parent/trips",
                          headers=h(parent1_ctx), timeout=10).json()
        matches = [t for t in pt if t["batch_id"] == bid]
        if matches:
            assert matches[0]["batch_unavailable"] is True
            assert matches[0]["unavailable_reason"] == reason

        # starting a new trip on same batch clears unavailability
        r = requests.post(f"{API}/driver/trips/start",
                          json={"batch_id": bid}, headers=h(driver_ctx), timeout=10)
        assert r.status_code == 200
        pt2 = requests.get(f"{API}/parent/trips",
                           headers=h(parent1_ctx), timeout=10).json()
        matches2 = [t for t in pt2 if t["batch_id"] == bid]
        if matches2:
            assert matches2[0]["batch_unavailable"] is False
        _cleanup_trip(driver_ctx)


# --------------------- Parent: live info + isolation ---------------------
class TestParentLiveInfo:
    def test_distance_eta_traffic_present_when_active(self, driver_ctx, parent1_ctx):
        _cleanup_trip(driver_ctx)
        # find the batch containing parent1's student
        children = requests.get(f"{API}/parent/children",
                                headers=h(parent1_ctx), timeout=10).json()
        assert children
        bid = children[0]["batch_id"]

        r = requests.post(f"{API}/driver/trips/start", json={"batch_id": bid},
                          headers=h(driver_ctx), timeout=10)
        assert r.status_code == 200
        requests.post(f"{API}/driver/trips/location",
                      json={"lat": 12.9500, "lng": 77.5800},
                      headers=h(driver_ctx), timeout=10)

        pt = requests.get(f"{API}/parent/trips",
                          headers=h(parent1_ctx), timeout=10).json()
        matches = [t for t in pt if t["batch_id"] == bid]
        assert matches
        m = matches[0]
        assert m["distance_km"] is not None and m["distance_km"] > 0
        assert m["eta_min"] is not None and m["eta_min"] >= 1
        assert m["traffic"] in ("Light", "Moderate", "Heavy")
        assert m["driver_id"] and m["batch_id"] == bid

        _cleanup_trip(driver_ctx)

    def test_parent_isolation(self, driver_ctx, parent1_ctx, parent2_ctx):
        # parent2 should not see a trip active on a batch belonging to only-parent1 kids
        _cleanup_trip(driver_ctx)
        p1_kids = requests.get(f"{API}/parent/children",
                               headers=h(parent1_ctx), timeout=10).json()
        p2_kids = requests.get(f"{API}/parent/children",
                               headers=h(parent2_ctx), timeout=10).json()
        p1_bids = {k["batch_id"] for k in p1_kids}
        p2_bids = {k["batch_id"] for k in p2_kids}
        only_p1 = p1_bids - p2_bids
        if not only_p1:
            pytest.skip("no batch exclusive to parent1")
        bid = next(iter(only_p1))
        requests.post(f"{API}/driver/trips/start", json={"batch_id": bid},
                      headers=h(driver_ctx), timeout=10)
        requests.post(f"{API}/driver/trips/location",
                      json={"lat": 12.95, "lng": 77.58}, headers=h(driver_ctx), timeout=10)

        p2_trips = requests.get(f"{API}/parent/trips",
                                headers=h(parent2_ctx), timeout=10).json()
        # parent2 should not see any active trip
        assert all((t["trip"] is None) or (t["batch_id"] != bid) for t in p2_trips)
        _cleanup_trip(driver_ctx)


# --------------------- Admin alerts feed ---------------------
class TestAdminAlerts:
    def test_admin_alerts_role_guard(self, parent1_ctx):
        r = requests.get(f"{API}/admin/alerts", headers=h(parent1_ctx), timeout=10)
        assert r.status_code == 403

    def test_trip_start_creates_admin_alert(self, driver_ctx, admin_ctx):
        _cleanup_trip(driver_ctx)
        before = len(requests.get(f"{API}/admin/alerts",
                                  headers=h(admin_ctx), timeout=10).json())
        batches = requests.get(f"{API}/driver/batches",
                               headers=h(driver_ctx), timeout=10).json()
        requests.post(f"{API}/driver/trips/start",
                      json={"batch_id": batches[0]["id"]},
                      headers=h(driver_ctx), timeout=10)
        after_alerts = requests.get(f"{API}/admin/alerts",
                                    headers=h(admin_ctx), timeout=10).json()
        assert len(after_alerts) > before
        assert any(a["title"] == "Trip Started" for a in after_alerts)
        _cleanup_trip(driver_ctx)

    def test_read_all_admin_alerts(self, admin_ctx):
        r = requests.post(f"{API}/admin/alerts/read-all",
                          headers=h(admin_ctx), timeout=10)
        assert r.status_code == 200
        alerts = requests.get(f"{API}/admin/alerts",
                              headers=h(admin_ctx), timeout=10).json()
        assert all(a["read"] for a in alerts)
