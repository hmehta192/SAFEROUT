"""SafeRoute API regression suite (auth, driver, parent, admin, role guards)."""
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
PARENT1 = "+919000000003"  # Priya - 2 kids
PARENT2 = "+919000000004"  # Amit - 1 kid


def login(phone: str) -> dict:
    r = requests.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=15)
    assert r.status_code == 200, f"send-otp {phone}: {r.status_code} {r.text}"
    otp = r.json()["dev_otp"]
    r = requests.post(f"{API}/auth/verify-otp", json={"phone": phone, "otp": otp}, timeout=15)
    assert r.status_code == 200, f"verify-otp {phone}: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="session")
def admin_ctx():
    return login(ADMIN)


@pytest.fixture(scope="session")
def driver_ctx():
    return login(DRIVER)


@pytest.fixture(scope="session")
def parent1_ctx():
    return login(PARENT1)


def h(ctx):
    return {"Authorization": f"Bearer {ctx['token']}"}


# ----------------------- Auth -----------------------
class TestAuth:
    def test_send_otp_unregistered_returns_404(self):
        r = requests.post(f"{API}/auth/send-otp", json={"phone": "+919999999999"}, timeout=10)
        assert r.status_code == 404

    def test_send_otp_returns_dev_otp(self):
        r = requests.post(f"{API}/auth/send-otp", json={"phone": ADMIN}, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data.get("sent") is True
        assert data.get("dev_otp") and len(data["dev_otp"]) == 4
        assert data.get("role") == "admin"

    def test_verify_otp_wrong(self):
        requests.post(f"{API}/auth/send-otp", json={"phone": DRIVER}, timeout=10)
        r = requests.post(f"{API}/auth/verify-otp", json={"phone": DRIVER, "otp": "0000"}, timeout=10)
        assert r.status_code == 400

    def test_me_returns_user(self, admin_ctx):
        r = requests.get(f"{API}/auth/me", headers=h(admin_ctx), timeout=10)
        assert r.status_code == 200
        assert r.json()["role"] == "admin"

    def test_me_no_token(self):
        r = requests.get(f"{API}/auth/me", timeout=10)
        assert r.status_code == 401


# ----------------------- Role guards -----------------------
class TestRoleGuards:
    def test_parent_cannot_access_admin(self, parent1_ctx):
        r = requests.get(f"{API}/admin/overview", headers=h(parent1_ctx), timeout=10)
        assert r.status_code == 403

    def test_driver_cannot_access_parent(self, driver_ctx):
        r = requests.get(f"{API}/parent/trips", headers=h(driver_ctx), timeout=10)
        assert r.status_code == 403

    def test_admin_cannot_start_trip(self, admin_ctx):
        r = requests.post(f"{API}/driver/trips/start", json={"batch_id": "x"}, headers=h(admin_ctx), timeout=10)
        assert r.status_code == 403


# ----------------------- Driver flow -----------------------
class TestDriverFlow:
    def test_batches_have_students(self, driver_ctx):
        r = requests.get(f"{API}/driver/batches", headers=h(driver_ctx), timeout=10)
        assert r.status_code == 200
        batches = r.json()
        assert len(batches) == 2
        for b in batches:
            assert "students" in b and isinstance(b["students"], list)

    def test_full_trip_lifecycle_and_alerts(self, driver_ctx, parent1_ctx):
        # end any leftover trip first
        requests.post(f"{API}/driver/trips/end", headers=h(driver_ctx), timeout=10)

        batches = requests.get(f"{API}/driver/batches", headers=h(driver_ctx), timeout=10).json()
        batch = batches[0]
        # start
        r = requests.post(f"{API}/driver/trips/start", json={"batch_id": batch["id"]}, headers=h(driver_ctx), timeout=10)
        assert r.status_code == 200, r.text
        trip = r.json()
        assert trip["status"] == "started"
        assert trip["batch_id"] == batch["id"]

        # duplicate start rejected
        r2 = requests.post(f"{API}/driver/trips/start", json={"batch_id": batch["id"]}, headers=h(driver_ctx), timeout=10)
        assert r2.status_code == 400

        # location
        r = requests.post(f"{API}/driver/trips/location", json={"lat": 12.97, "lng": 77.59}, headers=h(driver_ctx), timeout=10)
        assert r.status_code == 200

        # status
        r = requests.post(f"{API}/driver/trips/status", json={"status": "on_the_way"}, headers=h(driver_ctx), timeout=10)
        assert r.status_code == 200 and r.json()["status"] == "on_the_way"

        r = requests.post(f"{API}/driver/trips/status", json={"status": "reached"}, headers=h(driver_ctx), timeout=10)
        assert r.status_code == 200 and r.json()["status"] == "reached"

        # invalid status
        r = requests.post(f"{API}/driver/trips/status", json={"status": "bad"}, headers=h(driver_ctx), timeout=10)
        assert r.status_code == 400

        # parent alerts reflect trip events
        alerts = requests.get(f"{API}/parent/alerts", headers=h(parent1_ctx), timeout=10).json()
        titles = [a["title"] for a in alerts]
        assert "Trip Started" in titles
        assert "On the Way" in titles or "Reached" in titles

        # parent trips shows active trip
        pt = requests.get(f"{API}/parent/trips", headers=h(parent1_ctx), timeout=10).json()
        assert any(t["trip"] and t["trip"]["status"] in ("on_the_way", "reached") for t in pt)

        # end
        r = requests.post(f"{API}/driver/trips/end", headers=h(driver_ctx), timeout=10)
        assert r.status_code == 200

        # active-trip should be null
        r = requests.get(f"{API}/driver/active-trip", headers=h(driver_ctx), timeout=10)
        assert r.status_code == 200
        assert r.json() is None

    def test_mark_absent_and_alert(self, driver_ctx, parent1_ctx):
        batches = requests.get(f"{API}/driver/batches", headers=h(driver_ctx), timeout=10).json()
        student = batches[0]["students"][0]
        r = requests.post(f"{API}/driver/students/{student['id']}/absent",
                          json={"absent": True}, headers=h(driver_ctx), timeout=10)
        assert r.status_code == 200 and r.json()["absent_today"] is True

        # alert produced for parent
        alerts = requests.get(f"{API}/parent/alerts", headers=h(parent1_ctx), timeout=10).json()
        assert any(a["type"] == "absent" and a["title"] == "Marked Absent" for a in alerts)

        # toggle back
        r = requests.post(f"{API}/driver/students/{student['id']}/absent",
                          json={"absent": False}, headers=h(driver_ctx), timeout=10)
        assert r.status_code == 200 and r.json()["absent_today"] is False

    def test_move_student_between_batches(self, driver_ctx, parent1_ctx):
        batches = requests.get(f"{API}/driver/batches", headers=h(driver_ctx), timeout=10).json()
        assert len(batches) >= 2
        source, target = batches[0], batches[1]
        if not source["students"]:
            pytest.skip("no students to move")
        s = source["students"][0]
        original = s["batch_id"]
        r = requests.post(f"{API}/driver/students/{s['id']}/move",
                          json={"batch_id": target["id"]}, headers=h(driver_ctx), timeout=10)
        assert r.status_code == 200

        alerts = requests.get(f"{API}/parent/alerts", headers=h(parent1_ctx), timeout=10).json()
        assert any(a["type"] == "batch_change" for a in alerts)

        # revert
        requests.post(f"{API}/driver/students/{s['id']}/move",
                      json={"batch_id": original}, headers=h(driver_ctx), timeout=10)


# ----------------------- Parent -----------------------
class TestParent:
    def test_priya_has_two_children(self, parent1_ctx):
        r = requests.get(f"{API}/parent/children", headers=h(parent1_ctx), timeout=10)
        assert r.status_code == 200
        kids = r.json()
        assert len(kids) == 2
        names = {k["name"] for k in kids}
        assert "Aarav Sharma" in names and "Kabir Sharma" in names

    def test_parent_trips_shape(self, parent1_ctx):
        r = requests.get(f"{API}/parent/trips", headers=h(parent1_ctx), timeout=10)
        assert r.status_code == 200
        arr = r.json()
        assert len(arr) == 2
        for t in arr:
            assert "student_id" in t and "batch_name" in t and "driver_name" in t

    def test_read_all_alerts(self, parent1_ctx):
        r = requests.post(f"{API}/parent/alerts/read-all", headers=h(parent1_ctx), timeout=10)
        assert r.status_code == 200
        alerts = requests.get(f"{API}/parent/alerts", headers=h(parent1_ctx), timeout=10).json()
        assert all(a["read"] for a in alerts)


# ----------------------- Admin -----------------------
class TestAdmin:
    def test_overview_counts(self, admin_ctx):
        r = requests.get(f"{API}/admin/overview", headers=h(admin_ctx), timeout=10)
        assert r.status_code == 200
        data = r.json()
        c = data["counts"]
        assert c["drivers"] >= 1 and c["parents"] >= 2 and c["students"] >= 3
        assert "active_trips" in c and isinstance(data["active_trips"], list)

    def test_add_and_delete_driver(self, admin_ctx):
        phone = f"+9198{int(time.time())%10000000:07d}"
        r = requests.post(f"{API}/admin/drivers",
                          json={"name": "TEST_Driver", "phone": phone, "vehicle_number": "TS99XX0001"},
                          headers=h(admin_ctx), timeout=10)
        assert r.status_code == 200, r.text
        did = r.json()["id"]
        # duplicate phone rejected
        r2 = requests.post(f"{API}/admin/drivers",
                           json={"name": "TEST_Driver2", "phone": phone, "vehicle_number": "TS99XX0002"},
                           headers=h(admin_ctx), timeout=10)
        assert r2.status_code == 400

        # list contains
        drivers = requests.get(f"{API}/admin/drivers", headers=h(admin_ctx), timeout=10).json()
        assert any(d["id"] == did for d in drivers)

        # delete
        r = requests.delete(f"{API}/admin/drivers/{did}", headers=h(admin_ctx), timeout=10)
        assert r.status_code == 200
        drivers = requests.get(f"{API}/admin/drivers", headers=h(admin_ctx), timeout=10).json()
        assert not any(d["id"] == did for d in drivers)

    def test_add_parent_batch_student_and_subscription(self, admin_ctx):
        phone = f"+9197{int(time.time())%10000000:07d}"
        p = requests.post(f"{API}/admin/parents", json={"name": "TEST_Parent", "phone": phone},
                          headers=h(admin_ctx), timeout=10).json()
        drivers = requests.get(f"{API}/admin/drivers", headers=h(admin_ctx), timeout=10).json()
        did = drivers[0]["id"]
        b = requests.post(f"{API}/admin/batches",
                          json={"name": "TEST_Batch", "driver_id": did, "school_name": "S", "pickup_time": "08:00 AM"},
                          headers=h(admin_ctx), timeout=10).json()
        s = requests.post(f"{API}/admin/students",
                          json={"name": "TEST_Student", "class_grade": "G1",
                                "parent_id": p["id"], "batch_id": b["id"], "plan": "annual"},
                          headers=h(admin_ctx), timeout=10)
        assert s.status_code == 200, s.text
        sid = s.json()["id"]
        assert s.json()["subscription"]["plan"] == "annual"
        assert s.json()["subscription"]["amount"] == 8000

        # subscription update
        r = requests.post(f"{API}/admin/students/{sid}/subscription",
                          json={"plan": "monthly", "status": "expired"},
                          headers=h(admin_ctx), timeout=10)
        assert r.status_code == 200
        assert r.json()["subscription"]["status"] == "expired"
        assert r.json()["subscription"]["plan"] == "monthly"

        # verify via list
        students = requests.get(f"{API}/admin/students", headers=h(admin_ctx), timeout=10).json()
        found = next(x for x in students if x["id"] == sid)
        assert found["subscription"]["status"] == "expired"

        # cleanup
        requests.delete(f"{API}/admin/students/{sid}", headers=h(admin_ctx), timeout=10)
        requests.delete(f"{API}/admin/parents/{p['id']}", headers=h(admin_ctx), timeout=10)

    def test_add_batch_invalid_driver(self, admin_ctx):
        r = requests.post(f"{API}/admin/batches",
                          json={"name": "TEST_BadBatch", "driver_id": "nonexistent-id"},
                          headers=h(admin_ctx), timeout=10)
        assert r.status_code == 404
