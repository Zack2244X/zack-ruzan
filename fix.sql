-- ابحث عن البيانات المكررة
SELECT quizzes_title, COUNT(*) AS count
FROM quizzes
GROUP BY quizzes_title
HAVING count > 1;

-- احذف الصفوف المكررة (احتفظ بواحد فقط)
DELETE q1 FROM quizzes q1
JOIN quizzes q2
ON q1.quizzes_title = q2.quizzes_title
AND q1.id > q2.id;

-- اعرض الـ indexes
SHOW INDEX FROM quizzes;
