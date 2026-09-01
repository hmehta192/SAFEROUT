from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import random
import uuid
import jwt
from pathlib import Path
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'saferoute-dev-secret')
JWT_ALGO = 'HS256'

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("saferoute")


# ----------------------------- Helpers -----------------------------

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


def make_token(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=30),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload["sub"], "deleted_at": None}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def require_role(*roles):
    async def checker(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Forbidden")
        return user
    return checker


# ----------------------------- Models -----------------------------

class SendOtpBody(BaseModel):
    phone: str


class VerifyOtpBody(BaseModel):
    phone: str
    otp: str


class DriverBody(BaseModel):
    name: str
    phone: str
    vehicle_number: str
    vehicle_label: Optional[str] = ""


class ParentBody(BaseModel):
    name: str
    phone: str


class BatchBody(BaseModel):
    name: str
    driver_id: str
    school_name: Optional[str] = ""
    pickup_time: Optional[str] = ""


class StudentBody(BaseModel):
    name: str
    class_grade: Optional[str] = ""
    parent_id: str
    batch_id: str
    plan: Optional[str] = "monthly"  # monthly | annual


class SubscriptionBody(BaseModel):
    plan: str  # monthly | annual
    status: str  # active | expired


class StatusBody(BaseModel):
    status: str  # on_the_way | reached


class LocationBody(BaseModel):
    lat: float
    lng: float


class AbsentBody(BaseModel):
    absent: bool


class MoveBody(BaseModel):
    batch_id: str


class StartTripBody(BaseModel):
    batch_id: str


PLAN_PRICING = {"monthly": 800, "annual": 8000}


def build_subscription(plan: str):
    start = datetime.now(timezone.utc)
    days = 30 if plan == "monthly" else 365
    return {
        "plan": plan,
        "status": "active",
        "amount": PLAN_PRICING.get(plan, 800),
        "start_date": start.isoformat(),
        "end_date": (start + timedelta(days=days)).isoformat(),
    }


async def create_alert(parent_id: str, atype: str, title: str, message: str):
    doc = {
        "id": new_id(),
        "parent_id": parent_id,
        "type": atype,
        "title": title,
        "message": message,
        "read": False,
        "created_at": now_iso(),
        "deleted_at": None,
    }
    await db.alerts.insert_one(doc)


def student_public(s: dict) -> dict:
    return {
        "id": s["id"],
        "name": s["name"],
        "class_grade": s.get("class_grade", ""),
        "parent_id": s.get("parent_id"),
        "batch_id": s.get("batch_id"),
        "absent_today": s.get("absent_today", False),
    }


# ----------------------------- Auth -----------------------------

@api_router.get("/")
async def root():
    return {"message": "SafeRoute API"}


@api_router.post("/auth/send-otp")
async def send_otp(body: SendOtpBody):
    phone = body.phone.strip()
    user = await db.users.find_one({"phone": phone, "deleted_at": None}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="This number is not registered. Please contact your school admin.")
    otp = str(random.randint(1000, 9999))
    await db.otps.update_one(
        {"phone": phone},
        {"$set": {"otp": otp, "created_at": now_iso()}},
        upsert=True,
    )
    logger.info(f"OTP for {phone}: {otp}")
    # Simulated OTP delivery: returned in response for preview/testing.
    return {"sent": True, "dev_otp": otp, "role": user["role"]}


@api_router.post("/auth/verify-otp")
async def verify_otp(body: VerifyOtpBody):
    phone = body.phone.strip()
    record = await db.otps.find_one({"phone": phone})
    if not record or record.get("otp") != body.otp.strip():
        raise HTTPException(status_code=400, detail="Invalid OTP")
    user = await db.users.find_one({"phone": phone, "deleted_at": None}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.otps.delete_one({"phone": phone})
    token = make_token(user["id"], user["role"])
    return {"token": token, "user": user}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


# ----------------------------- Driver -----------------------------

@api_router.get("/driver/batches")
async def driver_batches(user: dict = Depends(require_role("driver"))):
    batches = await db.batches.find({"driver_id": user["id"], "deleted_at": None}, {"_id": 0}).to_list(100)
    result = []
    for b in batches:
        students = await db.students.find({"batch_id": b["id"], "deleted_at": None}, {"_id": 0}).to_list(200)
        result.append({**b, "students": [student_public(s) for s in students]})
    return result


@api_router.get("/driver/active-trip")
async def driver_active_trip(user: dict = Depends(require_role("driver"))):
    trip = await db.trips.find_one(
        {"driver_id": user["id"], "status": {"$ne": "ended"}}, {"_id": 0}
    )
    return trip


@api_router.post("/driver/trips/start")
async def start_trip(body: StartTripBody, user: dict = Depends(require_role("driver"))):
    existing = await db.trips.find_one({"driver_id": user["id"], "status": {"$ne": "ended"}})
    if existing:
        raise HTTPException(status_code=400, detail="A trip is already active")
    batch = await db.batches.find_one({"id": body.batch_id, "deleted_at": None}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    trip = {
        "id": new_id(),
        "driver_id": user["id"],
        "batch_id": body.batch_id,
        "batch_name": batch["name"],
        "status": "started",
        "current_lat": None,
        "current_lng": None,
        "started_at": now_iso(),
        "ended_at": None,
        "updated_at": now_iso(),
    }
    await db.trips.insert_one(trip)
    trip.pop("_id", None)
    students = await db.students.find({"batch_id": body.batch_id, "deleted_at": None}).to_list(200)
    for s in students:
        await create_alert(s["parent_id"], "trip_status", "Trip Started",
                           f"The bus for {s['name']} has started the trip.")
    return trip


@api_router.post("/driver/trips/status")
async def update_status(body: StatusBody, user: dict = Depends(require_role("driver"))):
    if body.status not in ("on_the_way", "reached"):
        raise HTTPException(status_code=400, detail="Invalid status")
    trip = await db.trips.find_one({"driver_id": user["id"], "status": {"$ne": "ended"}})
    if not trip:
        raise HTTPException(status_code=404, detail="No active trip")
    await db.trips.update_one({"id": trip["id"]}, {"$set": {"status": body.status, "updated_at": now_iso()}})
    label = "On the Way" if body.status == "on_the_way" else "Reached"
    students = await db.students.find({"batch_id": trip["batch_id"], "deleted_at": None}).to_list(200)
    for s in students:
        await create_alert(s["parent_id"], "trip_status", label,
                           f"The bus for {s['name']} status: {label}.")
    updated = await db.trips.find_one({"id": trip["id"]}, {"_id": 0})
    return updated


@api_router.post("/driver/trips/location")
async def update_location(body: LocationBody, user: dict = Depends(require_role("driver"))):
    trip = await db.trips.find_one({"driver_id": user["id"], "status": {"$ne": "ended"}})
    if not trip:
        raise HTTPException(status_code=404, detail="No active trip")
    updates = {"current_lat": body.lat, "current_lng": body.lng, "updated_at": now_iso()}
    if trip["status"] == "started":
        updates["status"] = "on_the_way"
    await db.trips.update_one({"id": trip["id"]}, {"$set": updates})
    return {"ok": True}


@api_router.post("/driver/trips/end")
async def end_trip(user: dict = Depends(require_role("driver"))):
    trip = await db.trips.find_one({"driver_id": user["id"], "status": {"$ne": "ended"}})
    if not trip:
        raise HTTPException(status_code=404, detail="No active trip")
    await db.trips.update_one({"id": trip["id"]}, {"$set": {"status": "ended", "ended_at": now_iso(), "updated_at": now_iso()}})
    students = await db.students.find({"batch_id": trip["batch_id"], "deleted_at": None}).to_list(200)
    for s in students:
        await create_alert(s["parent_id"], "trip_status", "Trip Ended",
                           f"The trip for {s['name']} has ended.")
    return {"ok": True}


@api_router.post("/driver/students/{student_id}/absent")
async def mark_absent(student_id: str, body: AbsentBody, user: dict = Depends(require_role("driver"))):
    student = await db.students.find_one({"id": student_id, "deleted_at": None})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    await db.students.update_one({"id": student_id}, {"$set": {"absent_today": body.absent}})
    if body.absent:
        await create_alert(student["parent_id"], "absent", "Marked Absent",
                          f"{student['name']} has been marked absent for today's trip.")
    else:
        await create_alert(student["parent_id"], "absent", "Marked Present",
                          f"{student['name']} is back on today's trip.")
    return {"ok": True, "absent_today": body.absent}


@api_router.post("/driver/students/{student_id}/move")
async def move_student(student_id: str, body: MoveBody, user: dict = Depends(require_role("driver"))):
    student = await db.students.find_one({"id": student_id, "deleted_at": None})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    batch = await db.batches.find_one({"id": body.batch_id, "deleted_at": None})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    await db.students.update_one({"id": student_id}, {"$set": {"batch_id": body.batch_id}})
    await create_alert(student["parent_id"], "batch_change", "Batch Changed",
                      f"{student['name']} has been moved to {batch['name']}.")
    return {"ok": True}


# ----------------------------- Parent -----------------------------

@api_router.get("/parent/children")
async def parent_children(user: dict = Depends(require_role("parent"))):
    students = await db.students.find({"parent_id": user["id"], "deleted_at": None}, {"_id": 0}).to_list(100)
    result = []
    for s in students:
        batch = await db.batches.find_one({"id": s.get("batch_id")}, {"_id": 0})
        driver = None
        if batch:
            driver = await db.users.find_one({"id": batch.get("driver_id")}, {"_id": 0})
        result.append({
            **student_public(s),
            "subscription": s.get("subscription"),
            "batch": batch,
            "driver": {"name": driver["name"], "vehicle_number": driver.get("vehicle_number"), "phone": driver.get("phone")} if driver else None,
        })
    return result


@api_router.get("/parent/trips")
async def parent_trips(user: dict = Depends(require_role("parent"))):
    students = await db.students.find({"parent_id": user["id"], "deleted_at": None}, {"_id": 0}).to_list(100)
    result = []
    for s in students:
        batch = await db.batches.find_one({"id": s.get("batch_id")}, {"_id": 0})
        driver = await db.users.find_one({"id": batch["driver_id"]}, {"_id": 0}) if batch else None
        trip = None
        if batch:
            trip = await db.trips.find_one({"batch_id": batch["id"], "status": {"$ne": "ended"}}, {"_id": 0})
        result.append({
            "student_id": s["id"],
            "student_name": s["name"],
            "absent_today": s.get("absent_today", False),
            "batch_name": batch["name"] if batch else None,
            "driver_name": driver["name"] if driver else None,
            "vehicle_number": driver.get("vehicle_number") if driver else None,
            "trip": trip,
        })
    return result


@api_router.get("/parent/alerts")
async def parent_alerts(user: dict = Depends(require_role("parent"))):
    alerts = await db.alerts.find({"parent_id": user["id"], "deleted_at": None}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return alerts


@api_router.post("/parent/alerts/read-all")
async def read_all_alerts(user: dict = Depends(require_role("parent"))):
    await db.alerts.update_many({"parent_id": user["id"]}, {"$set": {"read": True}})
    return {"ok": True}


# ----------------------------- Admin -----------------------------

@api_router.get("/admin/overview")
async def admin_overview(user: dict = Depends(require_role("admin"))):
    drivers = await db.users.count_documents({"role": "driver", "deleted_at": None})
    parents = await db.users.count_documents({"role": "parent", "deleted_at": None})
    students = await db.students.count_documents({"deleted_at": None})
    active = await db.trips.find({"status": {"$ne": "ended"}}, {"_id": 0}).to_list(100)
    active_trips = []
    for t in active:
        driver = await db.users.find_one({"id": t["driver_id"]}, {"_id": 0})
        active_trips.append({
            **t,
            "driver_name": driver["name"] if driver else "-",
            "vehicle_number": driver.get("vehicle_number") if driver else "-",
        })
    active_subs = await db.students.count_documents({"deleted_at": None, "subscription.status": "active"})
    return {
        "counts": {"drivers": drivers, "parents": parents, "students": students,
                   "active_trips": len(active_trips), "active_subscriptions": active_subs},
        "active_trips": active_trips,
    }


@api_router.get("/admin/drivers")
async def list_drivers(user: dict = Depends(require_role("admin"))):
    return await db.users.find({"role": "driver", "deleted_at": None}, {"_id": 0}).to_list(200)


@api_router.post("/admin/drivers")
async def add_driver(body: DriverBody, user: dict = Depends(require_role("admin"))):
    if await db.users.find_one({"phone": body.phone.strip(), "deleted_at": None}):
        raise HTTPException(status_code=400, detail="Phone already registered")
    doc = {"id": new_id(), "role": "driver", "name": body.name, "phone": body.phone.strip(),
           "vehicle_number": body.vehicle_number, "vehicle_label": body.vehicle_label,
           "created_at": now_iso(), "deleted_at": None}
    await db.users.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/admin/parents")
async def list_parents(user: dict = Depends(require_role("admin"))):
    return await db.users.find({"role": "parent", "deleted_at": None}, {"_id": 0}).to_list(500)


@api_router.post("/admin/parents")
async def add_parent(body: ParentBody, user: dict = Depends(require_role("admin"))):
    if await db.users.find_one({"phone": body.phone.strip(), "deleted_at": None}):
        raise HTTPException(status_code=400, detail="Phone already registered")
    doc = {"id": new_id(), "role": "parent", "name": body.name, "phone": body.phone.strip(),
           "created_at": now_iso(), "deleted_at": None}
    await db.users.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/admin/batches")
async def list_batches(user: dict = Depends(require_role("admin"))):
    batches = await db.batches.find({"deleted_at": None}, {"_id": 0}).to_list(200)
    for b in batches:
        driver = await db.users.find_one({"id": b["driver_id"]}, {"_id": 0})
        b["driver_name"] = driver["name"] if driver else "-"
        b["student_count"] = await db.students.count_documents({"batch_id": b["id"], "deleted_at": None})
    return batches


@api_router.post("/admin/batches")
async def add_batch(body: BatchBody, user: dict = Depends(require_role("admin"))):
    driver = await db.users.find_one({"id": body.driver_id, "role": "driver", "deleted_at": None})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    doc = {"id": new_id(), "name": body.name, "driver_id": body.driver_id,
           "school_name": body.school_name, "pickup_time": body.pickup_time,
           "created_at": now_iso(), "deleted_at": None}
    await db.batches.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/admin/students")
async def list_students(user: dict = Depends(require_role("admin"))):
    students = await db.students.find({"deleted_at": None}, {"_id": 0}).to_list(500)
    for s in students:
        parent = await db.users.find_one({"id": s.get("parent_id")}, {"_id": 0})
        batch = await db.batches.find_one({"id": s.get("batch_id")}, {"_id": 0})
        s["parent_name"] = parent["name"] if parent else "-"
        s["batch_name"] = batch["name"] if batch else "-"
    return students


@api_router.post("/admin/students")
async def add_student(body: StudentBody, user: dict = Depends(require_role("admin"))):
    if not await db.users.find_one({"id": body.parent_id, "role": "parent", "deleted_at": None}):
        raise HTTPException(status_code=404, detail="Parent not found")
    if not await db.batches.find_one({"id": body.batch_id, "deleted_at": None}):
        raise HTTPException(status_code=404, detail="Batch not found")
    doc = {"id": new_id(), "name": body.name, "class_grade": body.class_grade,
           "parent_id": body.parent_id, "batch_id": body.batch_id,
           "absent_today": False, "subscription": build_subscription(body.plan),
           "created_at": now_iso(), "deleted_at": None}
    await db.students.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.patch("/admin/students/{student_id}")
async def update_student(student_id: str, body: MoveBody, user: dict = Depends(require_role("admin"))):
    if not await db.batches.find_one({"id": body.batch_id, "deleted_at": None}):
        raise HTTPException(status_code=404, detail="Batch not found")
    student = await db.students.find_one({"id": student_id, "deleted_at": None})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    await db.students.update_one({"id": student_id}, {"$set": {"batch_id": body.batch_id}})
    batch = await db.batches.find_one({"id": body.batch_id})
    await create_alert(student["parent_id"], "batch_change", "Batch Changed",
                      f"{student['name']} has been moved to {batch['name']}.")
    return {"ok": True}


@api_router.post("/admin/students/{student_id}/subscription")
async def update_subscription(student_id: str, body: SubscriptionBody, user: dict = Depends(require_role("admin"))):
    student = await db.students.find_one({"id": student_id, "deleted_at": None})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    sub = build_subscription(body.plan)
    sub["status"] = body.status
    await db.students.update_one({"id": student_id}, {"$set": {"subscription": sub}})
    return {"ok": True, "subscription": sub}


@api_router.delete("/admin/students/{student_id}")
async def delete_student(student_id: str, user: dict = Depends(require_role("admin"))):
    await db.students.update_one({"id": student_id}, {"$set": {"deleted_at": now_iso()}})
    return {"ok": True}


@api_router.delete("/admin/drivers/{driver_id}")
async def delete_driver(driver_id: str, user: dict = Depends(require_role("admin"))):
    await db.users.update_one({"id": driver_id}, {"$set": {"deleted_at": now_iso()}})
    return {"ok": True}


@api_router.delete("/admin/parents/{parent_id}")
async def delete_parent(parent_id: str, user: dict = Depends(require_role("admin"))):
    await db.users.update_one({"id": parent_id}, {"$set": {"deleted_at": now_iso()}})
    return {"ok": True}


# ----------------------------- Seed -----------------------------

@app.on_event("startup")
async def seed_data():
    if await db.users.find_one({"role": "admin", "deleted_at": None}):
        return
    logger.info("Seeding demo data...")

    admin = {"id": new_id(), "role": "admin", "name": "School Admin", "phone": "+919000000001",
             "created_at": now_iso(), "deleted_at": None}
    driver = {"id": new_id(), "role": "driver", "name": "Rajesh Kumar", "phone": "+919000000002",
              "vehicle_number": "KA01AB1234", "vehicle_label": "Yellow Van 1",
              "created_at": now_iso(), "deleted_at": None}
    parent1 = {"id": new_id(), "role": "parent", "name": "Priya Sharma", "phone": "+919000000003",
               "created_at": now_iso(), "deleted_at": None}
    parent2 = {"id": new_id(), "role": "parent", "name": "Amit Patel", "phone": "+919000000004",
               "created_at": now_iso(), "deleted_at": None}
    await db.users.insert_many([admin, driver, parent1, parent2])

    batch1 = {"id": new_id(), "name": "Morning Pickup - Zone A", "driver_id": driver["id"],
              "school_name": "Little Angels School", "pickup_time": "07:30 AM",
              "created_at": now_iso(), "deleted_at": None}
    batch2 = {"id": new_id(), "name": "Afternoon Drop - Zone A", "driver_id": driver["id"],
              "school_name": "Little Angels School", "pickup_time": "03:30 PM",
              "created_at": now_iso(), "deleted_at": None}
    await db.batches.insert_many([batch1, batch2])

    students = [
        {"id": new_id(), "name": "Aarav Sharma", "class_grade": "Grade 3", "parent_id": parent1["id"],
         "batch_id": batch1["id"], "absent_today": False, "subscription": build_subscription("monthly"),
         "created_at": now_iso(), "deleted_at": None},
        {"id": new_id(), "name": "Diya Patel", "class_grade": "Grade 2", "parent_id": parent2["id"],
         "batch_id": batch1["id"], "absent_today": False, "subscription": build_subscription("annual"),
         "created_at": now_iso(), "deleted_at": None},
        {"id": new_id(), "name": "Kabir Sharma", "class_grade": "Grade 5", "parent_id": parent1["id"],
         "batch_id": batch2["id"], "absent_today": False, "subscription": build_subscription("monthly"),
         "created_at": now_iso(), "deleted_at": None},
    ]
    await db.students.insert_many(students)
    logger.info("Seed complete.")


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
