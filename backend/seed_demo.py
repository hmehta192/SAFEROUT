"""One-time demo data loader for SafeRoute.

Run with:  python /app/backend/seed_demo.py
Clears existing demo collections and inserts a rich, realistic dataset:
- 3 admins, 3 drivers (2 batches each), 60 students (10 per batch) each with a parent.
- One trip currently active (with a live location) + 2 students marked absent today.
"""
import os
import uuid
import random
from datetime import datetime, timezone, timedelta
from pathlib import Path

from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv(Path(__file__).parent / ".env")
db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


def now():
    return datetime.now(timezone.utc).isoformat()


def nid():
    return str(uuid.uuid4())


PLAN_PRICING = {"monthly": 800, "annual": 8000}


def sub(plan):
    start = datetime.now(timezone.utc)
    days = 30 if plan == "monthly" else 365
    return {
        "plan": plan,
        "status": "active",
        "amount": PLAN_PRICING[plan],
        "start_date": start.isoformat(),
        "end_date": (start + timedelta(days=days)).isoformat(),
    }


BASE_LAT, BASE_LNG = 30.7333, 76.7794       # Chandigarh (Punjab)
SCHOOL_LAT, SCHOOL_LNG = 30.7600, 76.7900

FIRST_M = ["Aarav", "Vivaan", "Arjun", "Kabir", "Ishaan", "Reyansh", "Ayaan", "Krish",
           "Manav", "Dhruv", "Ranveer", "Jashan", "Gurnoor", "Ekam", "Fateh"]
FIRST_F = ["Diya", "Aadhya", "Anaya", "Saanvi", "Myra", "Kiara", "Navya", "Simran",
           "Jasleen", "Harnoor", "Ishleen", "Gurleen", "Prisha", "Riya", "Meher"]
SURNAMES = ["Singh", "Kaur", "Sharma", "Verma", "Gill", "Sandhu", "Brar", "Dhillon",
            "Bedi", "Chahal", "Grewal", "Mann", "Bajwa", "Sidhu", "Kang"]
PARENT_FIRST = ["Harjeet", "Sukhwinder", "Baldev", "Manpreet", "Jaswant", "Kuldeep",
                "Ravinder", "Amrit", "Paramjit", "Tejinder", "Balwinder", "Davinder"]
CLASSES = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"]


def reset():
    for c in ["users", "batches", "students", "trips", "alerts", "otps"]:
        db[c].delete_many({})


def run():
    reset()
    random.seed(7)

    # Admins
    admins = [("Simran Kaur", "+919811100001"), ("Vikram Mehta", "+919811100002"),
              ("Anjali Verma", "+919811100003")]
    for n, p in admins:
        db.users.insert_one({"id": nid(), "role": "admin", "name": n, "phone": p,
                             "created_at": now(), "deleted_at": None})

    drivers_spec = [
        ("Gurpreet Singh", "+919812300001", "PB01AA1001", "Yellow Van 1"),
        ("Rajesh Kumar", "+919812300002", "PB02BB2002", "Yellow Van 2"),
        ("Harpreet Kaur", "+919812300003", "PB03CC3003", "Yellow Van 3"),
    ]

    parent_ctr = 10000001
    all_batches = []
    first_batch_id = None

    for di, (dn, dp, veh, label) in enumerate(drivers_spec):
        driver_id = nid()
        db.users.insert_one({"id": driver_id, "role": "driver", "name": dn, "phone": dp,
                             "vehicle_number": veh, "vehicle_label": label,
                             "created_at": now(), "deleted_at": None})

        for bname, btime in [("Morning Batch", "7:30 AM"), ("Afternoon Batch", "1:30 PM")]:
            batch_id = nid()
            if first_batch_id is None:
                first_batch_id = batch_id
            db.batches.insert_one({
                "id": batch_id, "name": f"{bname} - {dn.split()[0]}", "driver_id": driver_id,
                "school_name": "Green Valley Public School", "pickup_time": btime,
                "school_lat": SCHOOL_LAT, "school_lng": SCHOOL_LNG,
                "unavailable": False, "unavailable_reason": "",
                "created_at": now(), "deleted_at": None,
            })
            all_batches.append(batch_id)

            for i in range(10):
                surname = random.choice(SURNAMES)
                if i % 2 == 0:
                    sname = f"{random.choice(FIRST_M)} {surname}"
                else:
                    sname = f"{random.choice(FIRST_F)} {surname}"
                section = "A" if i < 5 else "B"
                cls = CLASSES[i % len(CLASSES)]

                parent_id = nid()
                pphone = "+9188" + f"{parent_ctr:08d}"
                parent_ctr += 1
                db.users.insert_one({
                    "id": parent_id, "role": "parent",
                    "name": f"{random.choice(PARENT_FIRST)} {surname}", "phone": pphone,
                    "created_at": now(), "deleted_at": None,
                })
                db.students.insert_one({
                    "id": nid(), "name": sname, "class_grade": cls, "section": section,
                    "parent_id": parent_id, "batch_id": batch_id, "absent_today": False,
                    "subscription": sub("monthly" if i % 3 else "annual"),
                    "updated_at": now(), "created_at": now(), "deleted_at": None,
                })

    # Make the first batch's trip currently ACTIVE with a live location.
    active_batch = db.batches.find_one({"id": first_batch_id})
    db.trips.insert_one({
        "id": nid(), "driver_id": active_batch["driver_id"], "batch_id": first_batch_id,
        "batch_name": active_batch["name"], "status": "on_the_way",
        "current_lat": BASE_LAT, "current_lng": BASE_LNG,
        "started_at": now(), "ended_at": None, "updated_at": now(),
    })

    # Mark 2 students in the active batch absent today.
    roster = list(db.students.find({"batch_id": first_batch_id}).limit(2))
    for s in roster:
        db.students.update_one({"id": s["id"]}, {"$set": {"absent_today": True, "updated_at": now()}})

    print("users:", db.users.count_documents({}))
    print("drivers:", db.users.count_documents({"role": "driver"}))
    print("admins:", db.users.count_documents({"role": "admin"}))
    print("parents:", db.users.count_documents({"role": "parent"}))
    print("batches:", db.batches.count_documents({}))
    print("students:", db.students.count_documents({}))
    print("active trips:", db.trips.count_documents({"status": {"$ne": "ended"}}))
    print("absent today:", db.students.count_documents({"absent_today": True}))
    print("Active batch:", active_batch["name"], "driver:", db.users.find_one({"id": active_batch["driver_id"]})["name"])


if __name__ == "__main__":
    run()
    print("Demo seed complete.")
