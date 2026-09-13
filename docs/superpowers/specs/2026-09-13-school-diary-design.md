# ClassBoard — Digital School Diary (MVP Design)

**Date:** 2026-09-13
**Status:** Approved in brainstorming, pending written-spec review
**Working name:** ClassBoard (placeholder)

## 1. Summary

ClassBoard is a multi-school web app that replaces the paper school diary. Each school gets an isolated workspace. Teachers post homework, classwork, tests, notices, and consent requests to classes; students and parents see one combined daily diary per class and receive reminders. Parents can give or decline consent (e.g. for trips). The platform owner (super admin) creates schools and assigns their admins but cannot see school data.

**Business model:** schools pay per workspace (pricing decided outside this spec).

## 2. Goals and non-goals

### Goals (MVP)
- Replace the paper diary for a school: daily homework/classwork/tests/notices visible to students and parents.
- Digital consent requests with a live response tracker.
- Reminders before homework, tests, and consent deadlines.
- Strict per-school data isolation.
- A teacher can write a diary entry in under 30 seconds.

### Non-goals (later versions)
Attendance, results/marks, homework submissions, fee management, teacher–parent chat, polls, native app-store apps, WhatsApp/SMS notifications, multiple UI languages (MVP is English; UI strings are kept in one place for later translation), billing inside the app.

## 3. Roles and hierarchy

```
Super admin (platform owner)
 └─ School workspace
     └─ School admin(s)
         └─ Teachers
             └─ Classes (sections, e.g. "Grade 7B")
                 └─ Students ── Guardian (parent) accounts
```

| Role | Summary |
|---|---|
| **Super admin** | Creates schools, assigns/replaces school admins, suspends/reactivates schools. Sees **counts and status only** — never student names, diaries, or consents. |
| **School admin** | Manages everything inside one school: teachers, class-creation permission, classes, students, guardians, school-wide notices, settings. |
| **Teacher** | Creates classes if permitted (becomes class teacher). Class teacher adds students and assigns subject teachers. Subject teachers post for their subject. |
| **Student** | Sees only their own class diary and school notices. Marks items done (private checklist). Cannot answer consents. |
| **Guardian** | View-only access to linked children's diaries and school notices. Can only answer consent requests. Cannot add or link children — the school links them. One guardian account may be linked to several siblings. |

Schools cannot self-register. Only the super admin creates schools.

## 4. User stories (MVP)

### Super admin
1. Create a school workspace (name, logo, city, contact person).
2. Assign a school admin (name, phone/email); the system creates the login and shows credentials to share.
3. Add, replace, or reset the password of a school admin.
4. Suspend or reactivate a school; suspended schools' users cannot use the app.
5. See all schools with counts (teachers, students), last activity, and status.

### School admin
1. Set school name, logo, brand colour, time zone, academic year.
2. Invite teachers (phone/email) and remove them.
3. Toggle which teachers can create classes.
4. See all classes and teachers in the school.
5. Create classes, add students, assign subject teachers (same powers as a class teacher, for any class).
6. Link siblings to one guardian account; reset student/guardian passwords; move a student to another class.
7. Post a school-wide notice or consent request to all or selected classes.
8. See the dashboard, including classes with no diary entry today.
9. Archive classes at the end of the academic year and promote students.

### Teacher
1. Create a class (if permitted) and become its class teacher.
2. As class teacher: add students one by one, by pasting a list, or by CSV/Excel upload; guardian logins are generated.
3. As class teacher: assign subject teachers to the class.
4. Post homework, classwork, test, notice, or consent request with title, details, due date, and optional attachments.
5. Post the same entry to several classes at once.
6. Edit or delete own entries; changes notify students and guardians.
7. Track consent responses per class and remind guardians who have not answered.
8. Switch between multiple classes.

### Student
1. Log in and see only their class diary grouped into Today / This Week / Later.
2. Open entry details and attachments.
3. Mark homework/tests done; optionally hide done items.
4. Receive reminders and see school notices.
5. See consent requests as information only.

### Guardian
1. Log in with school-issued account; switch between linked children.
2. See each child's diary and school notices (view only).
3. Receive notifications for new entries and consent requests.
4. Consent or decline (with optional note) before the deadline; change the answer until then.
5. See past consent responses.

## 5. UI

### Style
- Clean white UI; header uses the school's logo and brand colour.
- Colour-coded entry types: Homework (blue), Classwork (green), Test (orange), Notice (grey), Consent (purple).
- Large tap targets and plain wording for low-tech users.
- Red dot / unread badges for new or action-needed items.
- Phone-first for guardians, students, teachers; desktop layout for school admin and super admin panels (both remain usable on phones).

### Navigation
| Role | Navigation |
|---|---|
| Super admin | Desktop sidebar: Schools · Settings |
| School admin | Desktop sidebar: Dashboard · Teachers · Classes · Students & Guardians · Notices · Settings |
| Teacher | Bottom tabs: Classes · ➕ Post · Consents · Profile (sidebar on desktop) |
| Student | Bottom tabs: Diary · Calendar · Notices · Profile |
| Guardian | Bottom tabs: Diary · Calendar · Consents · Profile; child switcher in header |

### Screens (MVP)

**Shared**
1. **Login** — username/phone/email + password; forgot password link. Forced password change on first login for generated accounts.
2. **Forgot password** — admins/teachers reset by email/phone code; students/guardians are told to ask their teacher or admin.

**Super admin**
3. **Schools list** — search; columns: school, admin, student count, status; "+ New school".
4. **New school** — school details + first admin details → credentials screen with Copy / Share on WhatsApp.
5. **School detail** — info, admins (add, replace, reset password), counts, Suspend/Reactivate.

**School admin**
6. **Dashboard** — counts (teachers, classes, students), today's entry count, open consents, classes with no entry today.
7. **Teachers** — table: name, phone, classes, "Can create classes" toggle, remove; "+ Invite teacher".
8. **Classes** — list and class page (same as teacher class page, for all classes).
9. **Students & Guardians** — searchable list filtered by class; link siblings, reset passwords, move class.
10. **School notice** — the post composer with "Send to: All classes / chosen classes".
11. **Settings** — name, logo, colour, time zone, academic year, archive/promote.

**Teacher**
12. **My classes** — cards with class name, student count, pending consents; "+ Class" if permitted.
13. **Class page** — tabs: Diary (entries by date) · Students (list, add, remove; class teacher only for editing) · Subjects & teachers (class teacher) · Consents.
14. **New post** — type chips; classes multi-select; subject; title; details; due date; attachments (camera photo allowed); "Respond by" for consent.
15. **Consent tracker** — counts (consented / declined / pending), filter chips, per-student row with answer and note, "Remind pending".
16. **Add students** — tabs: One by one · Paste list · Upload CSV/Excel; then **Guardian logins** screen with Share on WhatsApp / Print slips.

**Student / Guardian**
17. **Diary home** — (guardian: child switcher and "Action needed" consent cards at top) Today, This Week, Later sections; student: mark-done checkboxes and "Hide done".
18. **Entry detail** — full text, attachments, teacher, subject, dates; consent buttons for guardians.
19. **Calendar** — month view of due dates.
20. **Consents** (guardian) / **Notices** (student) — pending first, history below.

## 6. Architecture

- **Next.js** web app (installable PWA) hosted on **Vercel**, one codebase with route areas:
  - `/platform` — super admin
  - `/admin` — school admin
  - `/teacher` — teacher
  - `/diary` — student and guardian
- **Supabase**:
  - **Auth** for all logins.
  - **PostgreSQL** for data; every school-owned row carries `school_id`.
  - **Row-level security (RLS)** enforces school isolation and role permissions in the database.
  - **Storage** for attachments in per-school folders, with access policies matching post visibility.
  - **Scheduled job** (every 15 minutes) for reminders.
- **Web Push** for notifications.

### Key rules
- Cross-school reads are impossible at the database level, independent of app code.
- Super admin data comes only from dedicated database functions that return aggregates (counts, status, last activity) and admin account details — never student, guardian, diary, or consent records.
- A suspended school's users are rejected at login and on every request (checked in RLS via school status).

## 7. Data model

| Table | Columns | Notes |
|---|---|---|
| `schools` | id, name, logo_path, city, contact_name, contact_phone, brand_color, time_zone, academic_year, status (`active`/`suspended`), created_at | |
| `profiles` | id (= auth user id), full_name, phone, email, username, is_super_admin, must_change_password | |
| `memberships` | school_id, user_id, role (`admin`/`teacher`/`student`/`guardian`), can_create_classes, active | One membership per user per school |
| `classes` | id, school_id, name, academic_year, class_teacher_id, archived | |
| `class_subjects` | id, class_id, subject, teacher_id | One teacher per subject per class |
| `students` | id, school_id, class_id, user_id, full_name, roll_no | A student belongs to exactly one active class; roll_no unique per class |
| `guardian_students` | guardian_user_id, student_id | Created only by admin/class teacher; one guardian per student, a guardian may have many students |
| `posts` | id, school_id, type (`homework`/`classwork`/`test`/`notice`/`consent`), subject_id (nullable), title, details, due_date, respond_by, created_by, created_at, updated_at, deleted_at | Soft delete |
| `post_classes` | post_id, class_id | One post to many classes; school notice links all selected classes |
| `attachments` | id, post_id, file_path, file_type, size_bytes | |
| `consent_responses` | post_id, student_id, guardian_user_id, answer (`consent`/`decline`), note, answered_at | Unique (post_id, student_id); editable until respond_by |
| `done_marks` | post_id, student_id, done_at | Private to student |
| `push_subscriptions` | id, user_id, endpoint, keys, created_at | |
| `notification_log` | id, user_id, post_id, kind, sent_at | Unique (user_id, post_id, kind) prevents duplicates |

### Permissions (enforced by RLS)
| Action | Allowed |
|---|---|
| Create school, assign school admins, suspend | Super admin |
| View school aggregates | Super admin (aggregates only) |
| Manage teachers and class-creation permission | School admin |
| Create class | School admin; teacher with `can_create_classes` (becomes class teacher) |
| Add/remove students, create guardian accounts, link siblings, assign subject teachers | School admin; class teacher of that class (sibling linking: school admin only) |
| Post to a class | School admin; class teacher; subject teacher of that class (only with their own subject) |
| Post school-wide notice | School admin |
| Edit/delete a post | Author; school admin |
| Read class diary | Class teacher and subject teachers; students of the class; guardians of those students; school admin |
| Answer consent | Linked guardian only |
| Mark done | The student only |

### Accounts for students and guardians
- System generates usernames (e.g. `ali.7b@cityschool`) and temporary passwords; users must change the password on first login.
- Guardians may also log in with a phone number if one is provided.
- Supabase Auth requires an email or phone; generated usernames map to internal placeholder emails on a domain the platform controls, and are never sent mail.

### Academic year rollover
Admin archives old classes (read-only, still visible), creates or promotes new classes, and moves students. Guardian links are kept.

## 8. Notifications and reminders

| Event | Recipients | Timing |
|---|---|---|
| New homework / classwork / test / notice | Students + guardians of target classes | Immediately |
| Post edited (date or content) or deleted | Same | Immediately |
| Homework/test reminder | Students without a done mark + their guardians | 19:00 the day before, 07:00 on due day |
| New consent request | Guardians of target classes | Immediately |
| Consent reminder | Guardians who have not answered | 19:00 the day before `respond_by`, or on teacher's "Remind pending" |
| School-wide notice | All members of the school | Immediately |

- Scheduler runs every 15 minutes, in each school's time zone, and writes `notification_log` before sending.
- Quiet hours 21:00–06:30: immediate notifications created in this window are held until 06:30. Scheduled reminders (19:00, 07:00) fall outside it.
- All events also appear as in-app unread badges, so users without push still see them.
- iPhone users receive push only after adding the app to the home screen; the app shows an install prompt explaining this.

## 9. Error handling and edge cases

- **Suspended school:** login shows "Your school's account is inactive. Contact your school."; active sessions are rejected on next request.
- **Removed teacher:** access revoked immediately; their posts remain, attributed to them.
- **Deleted post:** soft-deleted; recipients who open it see "This entry was removed."
- **Consent after deadline:** buttons disabled with "Response closed on <date>"; author or admin can extend `respond_by`.
- **Changed consent answer:** allowed until deadline; tracker shows latest answer and time.
- **Attachments:** images, PDF, Word only; max 10 MB each; max 5 per post; images compressed client-side before upload.
- **Offline:** diary shows the last cached copy with "Offline – showing saved diary"; unsent teacher posts stay as a local draft with Retry.
- **Password reset:** admins/teachers via email/phone code; students/guardians via their teacher or admin.
- **Duplicate students on paste/upload:** rows with an existing roll number in the class are flagged before saving.
- **Removing a student:** student and guardian lose access to that class; a guardian with no remaining linked students cannot log in.

## 10. Testing

- **RLS permission tests (highest priority):** log in as each role and verify: no cross-school reads; guardians see only linked children; subject teachers cannot post outside their subject/class; students cannot see other classes or answer consents; super admin cannot read diaries, students, guardians, or consents; suspended school users are blocked.
- **Unit tests:** reminder scheduling (time zones, quiet hours, skipping done items, no duplicates), consent deadline logic, pasted-list/CSV parsing and duplicate detection.
- **End-to-end tests (Playwright):**
  1. Super admin creates a school and assigns an admin.
  2. Admin invites a teacher and grants class creation; teacher creates Grade 7B and adds students; guardian logins are generated.
  3. Teacher posts homework; guardian sees it; student marks it done.
  4. Teacher posts a trip consent request; guardian consents; tracker updates.
  5. Super admin suspends the school; its users are blocked.
- **Pilot:** one real school for two weeks before selling. Success metrics: diary entries per class per school day, and share of guardians who log in weekly.

## 11. Success criteria for the MVP

- A pilot school uses the app instead of the paper diary for two weeks.
- Most classes have at least one entry per school day.
- A majority of guardians in the pilot log in at least weekly.
- Zero cross-school or cross-class data exposure found in RLS tests.
