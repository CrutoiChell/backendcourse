import express from 'express'
import cors from 'cors'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()

// Исправленный блок CORS: убрали слэш в конце и добавили обработку OPTIONS
app.use(cors({
  origin: "https://course-six-theta.vercel.app",
  credentials: true
}));

// Добавлено для Vercel: ответ на предварительные запросы браузера
app.options('*', cors())

app.use(express.json())

const DB_PATH = path.join(__dirname, 'data', 'db.json')

const readDB = async () => {
  const data = await fs.readFile(DB_PATH, 'utf-8')
  return JSON.parse(data)
}

const writeDB = async (data) => {
  await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2))
}

// Auth
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body
  const db = await readDB()
  const user = db.users.find(u => u.email === email && u.password === password)
  
  if (user) {
    const { password, ...userWithoutPassword } = user
    res.json({ success: true, user: userWithoutPassword })
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' })
  }
})

app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body
  const db = await readDB()
  
  if (db.users.find(u => u.email === email)) {
    return res.status(400).json({ success: false, message: 'User exists' })
  }
  
  const newUser = {
    id: Date.now().toString(),
    name,
    email,
    password,
    role: 'student',
    createdAt: new Date().toISOString()
  }
  
  db.users.push(newUser)
  await writeDB(db)
  
  const { password: _, ...userWithoutPassword } = newUser
  res.json({ success: true, user: userWithoutPassword })
})

// Courses
app.get('/api/courses', async (req, res) => {
  const db = await readDB()
  res.json(db.courses)
})

app.get('/api/courses/:id', async (req, res) => {
  try {
    const courseFile = path.join(__dirname, 'data', 'courses', `course-${req.params.id}.json`)
    const courseData = await fs.readFile(courseFile, 'utf-8')
    const course = JSON.parse(courseData)
    res.json(course)
  } catch (err) {
    // Fallback to db.json if file doesn't exist
    const db = await readDB()
    const course = db.courses.find(c => c.id === req.params.id)
    res.json(course)
  }
})

// Admin: Create/Update Course
app.post('/api/admin/courses', async (req, res) => {
  try {
    const courseData = req.body
    console.log('Creating/updating course:', courseData.id)
    
    const courseFile = path.join(__dirname, 'data', 'courses', `course-${courseData.id}.json`)
    
    await fs.writeFile(courseFile, JSON.stringify(courseData, null, 2))
    console.log('Course file saved:', courseFile)
    
    // Update db.json with basic info
    const db = await readDB()
    const existingIndex = db.courses.findIndex(c => c.id === courseData.id)
    const basicInfo = {
      id: courseData.id,
      title: courseData.title,
      description: courseData.description,
      duration: courseData.duration,
      students: courseData.students || "0",
      rating: courseData.rating || "5.0",
      price: courseData.price
    }
    
    if (existingIndex >= 0) {
      db.courses[existingIndex] = basicInfo
    } else {
      db.courses.push(basicInfo)
    }
    
    await writeDB(db)
    console.log('DB updated')
    
    res.json({ success: true, course: courseData })
  } catch (err) {
    console.error('Error creating course:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

// Admin: Delete Course
app.delete('/api/admin/courses/:id', async (req, res) => {
  const courseFile = path.join(__dirname, 'data', 'courses', `course-${req.params.id}.json`)
  
  try {
    await fs.unlink(courseFile)
  } catch (err) {
    // File might not exist
  }
  
  const db = await readDB()
  db.courses = db.courses.filter(c => c.id !== req.params.id)
  await writeDB(db)
  
  res.json({ success: true })
})

// Tests
app.get('/api/tests/:testId', async (req, res) => {
  // First try to find in course files
  try {
    const coursesDir = path.join(__dirname, 'data', 'courses')
    const files = await fs.readdir(coursesDir)
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        const courseData = await fs.readFile(path.join(coursesDir, file), 'utf-8')
        const course = JSON.parse(courseData)
        const test = course.tests?.find(t => t.id === req.params.testId)
        if (test) {
          return res.json(test)
        }
      }
    }
  } catch (err) {
    console.error('Error reading course files:', err)
  }
  
  // Fallback to db.json
  const db = await readDB()
  const test = db.tests.find(t => t.id === req.params.testId)
  res.json(test)
})

app.post('/api/tests/:testId/submit', async (req, res) => {
  const { answers, userId } = req.body
  
  // Find test in course files
  let test = null
  try {
    const coursesDir = path.join(__dirname, 'data', 'courses')
    const files = await fs.readdir(coursesDir)
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        const courseData = await fs.readFile(path.join(coursesDir, file), 'utf-8')
        const course = JSON.parse(courseData)
        test = course.tests?.find(t => t.id === req.params.testId)
        if (test) break
      }
    }
  } catch (err) {
    console.error('Error reading course files:', err)
  }
  
  // Fallback to db.json
  if (!test) {
    const db = await readDB()
    test = db.tests.find(t => t.id === req.params.testId)
  }
  
  let score = 0
  test.questions.forEach((q, i) => {
    if (answers[i] === q.correctAnswer) score++
  })
  
  const result = {
    score,
    total: test.questions.length,
    passed: score >= test.questions.length * 0.7
  }
  
  res.json(result)
})

// Schedule
app.get('/api/schedule', async (req, res) => {
  const db = await readDB()
  res.json(db.schedule)
})

app.post('/api/schedule/book', async (req, res) => {
  const { classId, userId } = req.body
  const db = await readDB()
  
  const classItem = db.schedule.find(s => s.id === classId)
  if (classItem && classItem.enrolled < classItem.capacity) {
    classItem.enrolled++
    classItem.isBooked = true
    await writeDB(db)
    res.json({ success: true })
  } else {
    res.status(400).json({ success: false, message: 'Class full' })
  }
})

// Progress
app.get('/api/progress/:userId', async (req, res) => {
  const db = await readDB()
  const progress = db.progress.find(p => p.userId === req.params.userId)
  res.json(progress || {
    userId: req.params.userId,
    coursesCompleted: 0,
    totalCourses: 5,
    overallProgress: 0,
    upcomingClasses: 0,
    achievements: 0,
    favorites: []
  })
})

// Favorites
app.post('/api/favorites', async (req, res) => {
  const { userId, materialId } = req.body
  const db = await readDB()
  
  let progress = db.progress.find(p => p.userId === userId)
  if (!progress) {
    progress = { userId, favorites: [] }
    db.progress.push(progress)
  }
  
  if (!progress.favorites) progress.favorites = []
  progress.favorites.push(materialId)
  
  await writeDB(db)
  res.json({ success: true })
})

// Forum
app.get('/api/forum', async (req, res) => {
  const db = await readDB()
  res.json(db.forum)
})

app.post('/api/forum', async (req, res) => {
  const { userId, content, author } = req.body
  const db = await readDB()
  
  const newPost = {
    id: Date.now().toString(),
    userId,
    author,
    content,
    date: new Date().toLocaleDateString('ru-RU'),
    likes: 0
  }
  
  db.forum.unshift(newPost)
  await writeDB(db)
  res.json(newPost)
})

const PORT = process.env.PORT || 5001
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`)
})
