# School Database Design

## Tables

- **students**: one row per student. Holds `id` (primary key), `name` and `email`. The email is `UNIQUE` so two students cannot share one.
- **courses**: one row per course. Holds `id` (primary key), `title` and `credits`.
- **enrolments**: one row per student-on-course. Holds `id` (primary key), `student_id` and `course_id` (both foreign keys, `NOT NULL`) and `grade`. The grade can be `NULL` because a student is enrolled before being graded. `UNIQUE (student_id, course_id)` stops the same student enrolling on the same course twice.

## Relationships

- **students to enrolments: one-to-many.** One student can have many enrolments, but each enrolment belongs to one student.
- **courses to enrolments: one-to-many.** One course can have many enrolments, but each enrolment belongs to one course.
- **students to courses: many-to-many.** A student takes many courses and a course has many students.

A relational table cannot store a list in a single column, so a many-to-many relationship needs a join table. `enrolments` is that join table: it turns the many-to-many link into two one-to-many links. It also gives the grade a natural home, since a grade belongs to the pairing of a student and a course, not to either one alone.

## Index

I would add an index on `enrolments(course_id)`:

```sql
CREATE INDEX idx_enrolments_course_id ON enrolments(course_id);
```

The `UNIQUE (student_id, course_id)` rule already creates an index that speeds up lookups by student. Queries by course, such as "all students on one course" or "students per course", have no index to use and would scan the whole table as it grows.

## SQL or NoSQL?

I would choose SQL. The data is structured and highly relational: students, courses and enrolments always link to each other in predictable ways. The system needs rules enforced by the database itself, such as unique emails, no duplicate enrolments and no enrolment for a student or course that does not exist. It also needs joins and aggregates, like counting students per course. SQL handles these directly with constraints and queries, and transactions keep the data consistent. NoSQL would suit data with a flexible or changing shape, or very large scale with simple lookups, but here it would push the integrity checks and joins into application code.
