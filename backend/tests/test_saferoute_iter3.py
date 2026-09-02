"""SafeRoute iteration-3 tests: rich demo data, admin overview enrichment, movement simulator,
student class/section everywhere, add-student section field, parent live info on active Morning batch."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set"
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = "+919811100001"
ADMIN2 = "+919811100002"
DRIVER_GURPREET = "+919812300001"   # has active Morning batch
DRIVER_RAJESH = "+919812300002"
PARENT_LIVE = "+918810000003"       # child Manav Sidhu on active Morning batch
PARENT_ABSENT = "+918810000001"     # child Arjun Sandhu absent today


def login(phone: str) -> dict:
    r = requests.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=15)
    assert r.status_code == 200, r.text
    otp = r.json()["dev_otp"]
    r = requests.post(f"{API}/auth/verify-otp", json={"phone": phone, "otp": otp}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def h(ctx):
    return {"Authorization": f"Bearer {ctx['token']}"}


# ---------- Shared fixtures ----------
@pytest.fixture(scope="module")
def admin_ctx():
    return login(ADMIN)


@pytest.fixture(scope="module")
def driver_ctx():
    return login(DRIVER_GURPREET)


@pytest.fixture(scope="module")
def parent_live_ctx():
    return login(PARENT_LIVE)


@pytest.fixture(scope="module")
def parent_absent_ctx():
    return login(PARENT_ABSENT)


# ---------- Seed / counts ----------
class TestSeed:
    def test_overview_counts(self, admin_ctx):
        r = requests.get(f"{API}/admin/overview", headers=h(admin_ctx), timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        c = data["counts"]
        assert c["drivers"] == 3, c
        assert c["parents"] == 60, c
        assert c["students"] == 60, c
        assert c["active_trips"] >= 1, c
        assert c["active_subscriptions"] >= 1

    def test_absent_students_list(self, admin_ctx):
        data = requests.get(f"{API}/admin/overview", headers=h(admin_ctx), timeout=10).json()
        absent = data["absent_students"]
        assert len(absent) == 2, absent
        for a in absent:
            assert a["name"]
            assert a["class_grade"]
            assert a["section"] in ("A", "B")
            assert a["batch_name"]
            assert a["updated_at"]

    def test_admins_and_drivers_count(self, admin_ctx):
        drivers = requests.get(f"{API}/admin/drivers", headers=h(admin_ctx), timeout=10).json()
        parents = requests.get(f"{API}/admin/parents", headers=h(admin_ctx), timeout=10).json()
        batches = requests.get(f"{API}/admin/batches", headers=h(admin_ctx), timeout=10).json()
        students = requests.get(f"{API}/admin/students", headers=h(admin_ctx), timeout=10).json()
        assert len(drivers) == 3
        assert len(parents) == 60
        # 3 drivers * 2 batches each
        assert len(batches) == 6
        assert len(students) == 60


# ---------- Active trip enrichment ----------
class TestActiveTripEnrichment:
    def test_active_trip_has_full_metadata(self, admin_ctx):
        data = requests.get(f"{API}/admin/overview", headers=h(admin_ctx), timeout=10).json()
        assert data["active_trips"], "expected at least one active trip"
        t = data["active_trips"][0]
        for key in ("driver_name", "vehicle_number", "batch_name", "status",
                    "current_lat", "current_lng", "started_at", "updated_at",
                    "students_on_board", "total_students", "students"):
            assert key in t, f"missing key {key}"
        assert t["driver_name"] == "Gurpreet Singh"
        assert t["batch_name"].startswith("Morning Batch")
        assert t["total_students"] == 10
        # 2 absent overall, at least one likely in the morning batch → on_board <= total
        assert 0 < t["students_on_board"] <= t["total_students"]
        for s in t["students"]:
            assert s["name"]
            assert s["class_grade"]
            assert s["section"] in ("A", "B")
            assert isinstance(s["absent"], bool)


# ---------- Movement simulator ----------
class TestMovementSimulator:
    def test_current_location_changes(self, admin_ctx):
        d1 = requests.get(f"{API}/admin/overview", headers=h(admin_ctx), timeout=10).json()
        t1 = d1["active_trips"][0]
        lat1, lng1, upd1 = t1["current_lat"], t1["current_lng"], t1["updated_at"]
        # simulator runs every ~6s; give it 9s
        time.sleep(9)
        d2 = requests.get(f"{API}/admin/overview", headers=h(admin_ctx), timeout=10).json()
        t2 = next((t for t in d2["active_trips"] if t["id"] == t1["id"]), None)
        assert t2 is not None
        moved = (t2["current_lat"], t2["current_lng"]) != (lat1, lng1) or t2["updated_at"] != upd1
        assert moved, f"trip location did not update in 9s: {lat1},{lng1}@{upd1} vs {t2['current_lat']},{t2['current_lng']}@{t2['updated_at']}"


# ---------- Student enrichment everywhere ----------
class TestStudentFullFields:
    def test_admin_students_have_class_section(self, admin_ctx):
        students = requests.get(f"{API}/admin/students", headers=h(admin_ctx), timeout=10).json()
        assert students
        for s in students[:10]:
            assert s["name"]
            assert s.get("class_grade")
            assert s.get("section") in ("A", "B")
            assert s.get("batch_id")
            assert s.get("parent_id")
            assert s.get("updated_at")

    def test_driver_batches_include_class_section(self):
        ctx = login(DRIVER_GURPREET)
        batches = requests.get(f"{API}/driver/batches", headers=h(ctx), timeout=10).json()
        assert len(batches) == 2, [b["name"] for b in batches]
        found_students = False
        for b in batches:
            for s in b["students"]:
                found_students = True
                assert s["class_grade"]
                assert s["section"] in ("A", "B")
                assert "updated_at" in s
        assert found_students

    def test_parent_children_has_class_section(self, parent_live_ctx):
        kids = requests.get(f"{API}/parent/children", headers=h(parent_live_ctx), timeout=10).json()
        assert kids
        for k in kids:
            assert k["class_grade"]
            assert k["section"] in ("A", "B")
            assert k["batch_id"]


# ---------- Add student with section ----------
class TestAddStudentSection:
    def test_admin_can_add_student_with_section(self, admin_ctx):
        parents = requests.get(f"{API}/admin/parents", headers=h(admin_ctx), timeout=10).json()
        batches = requests.get(f"{API}/admin/batches", headers=h(admin_ctx), timeout=10).json()
        payload = {
            "name": "TEST_Section_Student",
            "class_grade": "5th",
            "section": "B",
            "parent_id": parents[0]["id"],
            "batch_id": batches[0]["id"],
            "plan": "monthly",
        }
        r = requests.post(f"{API}/admin/students", json=payload, headers=h(admin_ctx), timeout=10)
        assert r.status_code == 200, r.text
        created = r.json()
        assert created["section"] == "B"
        assert created["class_grade"] == "5th"
        sid = created["id"]
        # verify via GET
        students = requests.get(f"{API}/admin/students", headers=h(admin_ctx), timeout=10).json()
        got = next((s for s in students if s["id"] == sid), None)
        assert got and got["section"] == "B"
        # cleanup
        requests.delete(f"{API}/admin/students/{sid}", headers=h(admin_ctx), timeout=10)


# ---------- Driver of active batch ----------
class TestDriverActive:
    def test_gurpreet_has_active_trip_on_morning(self, driver_ctx):
        active = requests.get(f"{API}/driver/active-trip", headers=h(driver_ctx), timeout=10).json()
        assert active is not None
        batches = requests.get(f"{API}/driver/batches", headers=h(driver_ctx), timeout=10).json()
        morning = next(b for b in batches if b["name"].startswith("Morning"))
        assert active["batch_id"] == morning["id"]
        assert active["current_lat"] is not None
        assert active["current_lng"] is not None


# ---------- Parent live view ----------
class TestParentLiveView:
    def test_parent_on_active_trip_gets_live_info(self, parent_live_ctx):
        trips = requests.get(f"{API}/parent/trips", headers=h(parent_live_ctx), timeout=10).json()
        assert trips
        active = [t for t in trips if t.get("trip")]
        assert active, "expected an active trip for live parent"
        a = active[0]
        assert a["distance_km"] is not None and a["distance_km"] > 0
        assert a["eta_min"] is not None and a["eta_min"] >= 1
        assert a["traffic"] in ("Light", "Moderate", "Heavy")

    def test_parent_with_absent_child_sees_absent_flag(self, parent_absent_ctx):
        kids = requests.get(f"{API}/parent/children", headers=h(parent_absent_ctx), timeout=10).json()
        assert kids
        assert any(k.get("absent_today") for k in kids), \
            f"expected an absent child for {PARENT_ABSENT}: {[(k['name'], k.get('absent_today')) for k in kids]}"


# ---------- Role guards ----------
class TestRoleGuards:
    def test_parent_cannot_access_admin_overview(self, parent_live_ctx):
        r = requests.get(f"{API}/admin/overview", headers=h(parent_live_ctx), timeout=10)
        assert r.status_code == 403

    def test_driver_cannot_access_admin_overview(self, driver_ctx):
        r = requests.get(f"{API}/admin/overview", headers=h(driver_ctx), timeout=10)
        assert r.status_code == 403

    def test_parent_cannot_access_driver_batches(self, parent_live_ctx):
        r = requests.get(f"{API}/driver/batches", headers=h(parent_live_ctx), timeout=10)
        assert r.status_code == 403

    def test_admin_cannot_access_parent_trips(self, admin_ctx):
        r = requests.get(f"{API}/parent/trips", headers=h(admin_ctx), timeout=10)
        assert r.status_code == 403


# ---------- Admin alerts / notifications bell ----------
class TestAdminAlerts:
    def test_admin_alerts_endpoint(self, admin_ctx):
        r = requests.get(f"{API}/admin/alerts", headers=h(admin_ctx), timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
