PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS enrolments;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS students;

-- Tables
CREATE TABLE students (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE
);

CREATE TABLE courses (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  credits INTEGER NOT NULL
);

CREATE TABLE enrolments (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL,
  course_id INTEGER NOT NULL,
  grade INTEGER,
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (course_id) REFERENCES courses(id),
  UNIQUE (student_id, course_id)
);

-- Sample data
INSERT INTO students (name, email) VALUES
  ('Amina Hassan', 'amina@example.com'),
  ('Brian Otieno', 'brian@example.com'),
  ('Cynthia Wanjiru', 'cynthia@example.com'),
  ('David Kamau', 'david@example.com');

INSERT INTO courses (title, credits) VALUES
  ('Web Foundations', 3),
  ('Databases', 4),
  ('Data Visualisation', 3);

INSERT INTO enrolments (student_id, course_id, grade) VALUES
  (1, 1, 85),
  (1, 2, 78),
  (2, 1, 66),
  (2, 3, NULL),
  (3, 2, 91),
  (3, 3, 73);

-- Query 1: all courses for one student (by name)
SELECT courses.title, enrolments.grade
FROM students
JOIN enrolments ON enrolments.student_id = students.id
JOIN courses ON courses.id = enrolments.course_id
WHERE students.name = 'Amina Hassan';

-- Query 2: all students on one course
SELECT students.name, students.email
FROM courses
JOIN enrolments ON enrolments.course_id = courses.id
JOIN students ON students.id = enrolments.student_id
WHERE courses.title = 'Databases';

-- Query 3: number of students per course
SELECT courses.title, COUNT(enrolments.id) AS student_count
FROM courses
LEFT JOIN enrolments ON enrolments.course_id = courses.id
GROUP BY courses.id, courses.title;

-- Query 4: students who have no enrolments
SELECT students.name, students.email
FROM students
LEFT JOIN enrolments ON enrolments.student_id = students.id
WHERE enrolments.id IS NULL;

-- Query 5: update one enrolment's grade
UPDATE enrolments
SET grade = 70
WHERE student_id = (SELECT id FROM students WHERE name = 'Brian Otieno')
  AND course_id = (SELECT id FROM courses WHERE title = 'Data Visualisation');

SELECT * FROM enrolments;