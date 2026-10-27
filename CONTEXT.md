# Agapay

A platform that connects patients with licensed physical therapists for home-based therapy: patients are matched with therapists, book recurring home sessions under a care contract, and rate their care; an admin team verifies therapists and moderates the platform.

## Language

### People

**Patient**:
A person who receives home-based therapy and books sessions with a therapist.
_Avoid_: Client, customer

**Therapist**:
A licensed physical therapist who delivers sessions. (The role name in the system is `PhysicalTherapist`.)
_Avoid_: Doctor, provider

**Admin**:
A platform operator who verifies therapists, curates conditions and moderates reports and accounts.
_Avoid_: Moderator, superuser

**Colleague**:
Another therapist a therapist has added to their trusted professional network; the pool from which a reliever is drawn. A connection is Pending until the other therapist accepts.
_Avoid_: Friend, contact, peer

**Reliever**:
A colleague proposed to take over a single session when the original therapist cannot attend.
_Avoid_: Substitute, replacement, stand-in

### Therapist onboarding and matching

**Verification**:
An admin's review of a therapist's license, ending in Verified or Rejected.
_Avoid_: Approval, validation

**Condition Treated**:
A named health condition, grouped into a category (e.g. Musculoskeletal, Pediatric), that a therapist declares they treat.
_Avoid_: Specialty, diagnosis

**Other Condition**:
A therapist-entered condition not in the curated list, awaiting admin curation (Pending, then Verified).
_Avoid_: Custom condition

**Specialization**:
A therapist's declared area of focus.

**Service Area**:
A location where a therapist is willing to travel to deliver sessions.
_Avoid_: Coverage, region

**Preferences**:
What a patient wants from a therapist (e.g. condition, days, gender), used to score matches.

**Recommendation**:
A scored match between a patient's preferences and a therapist, placed in the Recommended or Other Option tier.
_Avoid_: Suggestion, search result

### Care and sessions

**Contract**:
The agreement between one patient and one therapist for a course of recurring home sessions. Moves from Draft through Pending Confirmation to Active, then ends Completed, Cancelled, Expired or Terminated.
_Avoid_: Booking, subscription, plan

**Blueprint**:
The terms of a contract (schedule and care details) that the therapist sets and sends to the patient; the contract becomes Active when the patient confirms it.
_Avoid_: Proposal, quote

**Session**:
A single scheduled home visit under a contract. Its status is owned by one state machine (e.g. Scheduled, In Progress, Completed, Done For Today, Cancelled, and the pending states for cancellation, reliever acceptance and reschedule approval).
_Avoid_: Appointment, visit

**Done For Today**:
A recurring session that has been completed for the current day and is reset the next morning (5 AM Manila) for its next occurrence.

**Cancellation**:
Ending a session early, initiated by either the patient or the therapist, and acknowledged by the other party.

**Reschedule**:
A proposal to move a session to another time, which only takes effect once the other party approves.

**Rating**:
A review one party leaves for the other after care; patients rate therapists and therapists rate patients.
_Avoid_: Review, feedback

### Trust and safety

**Block**:
One user preventing another from contacting them in chat, optionally time-limited.

**Report**:
A user's complaint about another user or message, triaged by an admin with a status and priority.
_Avoid_: Flag, ticket

**Suspension**:
A temporary restriction of an account by an admin, auto-lifted on expiry; a **Ban** is permanent.
_Avoid_: Lock, deactivation
