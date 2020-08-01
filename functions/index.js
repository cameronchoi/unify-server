const functions = require('firebase-functions')
require('dotenv').config()
const admin = require('firebase-admin')
const express = require('express')
const app = express()

admin.initializeApp({
  credential: admin.credential.cert(require('./admin.json'))
})

const firebaseConfig = {
  apiKey: process.env.API_KEY,
  authDomain: 'unify-40e9b.firebaseapp.com',
  databaseURL: 'https://unify-40e9b.firebaseio.com',
  projectId: 'unify-40e9b',
  storageBucket: 'unify-40e9b.appspot.com',
  messagingSenderId: '721861398339',
  appId: '1:721861398339:web:3ee2cdb990e674a7cfe9f6',
  measurementId: 'G-RLMF7QHTJR'
}

const firebase = require('firebase')
firebase.initializeApp(firebaseConfig)

const db = admin.firestore()

const FBauth = (req, res, next) => {
  let idToken
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer ')
  ) {
    idToken = req.headers.authorization.split('Bearer ')[1]
  } else {
    console.error('No token found')
    return res.status(403).json({ error: 'Unauthorized' })
  }

  admin
    .auth()
    .verifyIdToken(idToken)
    .then(decodedToken => {
      req.user = decodedToken
      return db
        .collection('users')
        .where('userId', '==', req.user.uid)
        .limit(1)
        .get()
    })
    .then(data => {
      req.user.email = data.docs[0].data().email
      return next()
    })
    .catch(err => {
      console.error('Error while verifying token ', err)
      return res.status(403).json(err)
    })
}

const isEmpty = string => {
  if (string.trim() === '') return true
  else return false
}

//signup route
app.post('/signup', (req, res) => {
  const newUser = {
    email: req.body.email,
    password: req.body.password,
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    degree: req.body.degree,
    uniName: req.body.uniName,
    uniYear: req.body.uniYear,
    describeSelf: req.body.describeSelf,
    describeFriend: req.body.describeFriend,
    clotheType: req.body.clotheType,
    hairColour: req.body.hairColour,
    skinColour: req.body.skinColour,
    topType: req.body.topType,
    subjects: req.body.subjects
  }

  let token, userId
  db.doc(`/users/${newUser.email}`)
    .get()
    .then(doc => {
      if (doc.exists) {
        return res.status(400).json({ email: 'this email is already taken' })
      } else {
        return firebase
          .auth()
          .createUserWithEmailAndPassword(newUser.email, newUser.password)
      }
    })
    .then(data => {
      console.log('COMING HERE: 1')
      userId = data.user.uid
      return data.user.getIdToken()
    })
    .then(idToken => {
      console.log('COMING HERE: 2')
      token = idToken
      const userCredentials = {
        userId,
        email: newUser.email,
        createdAt: new Date().toISOString(),
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        degree: null,
        uniName: newUser.uniName,
        uniYear: newUser.uniYear,
        describeSelf: newUser.describeSelf,
        describeFriend: newUser.describeFriend,
        avatar: {
          clotheType: newUser.clotheType,
          hairColour: newUser.hairColour,
          skinColour: newUser.skinColour,
          topType: newUser.topType
        },
        subjects: newUser.subjects
      }
      db.collection('degrees')
        .where('degreeName', '==', newUser.degree)
        .where('uniName', '==', newUser.uniName)
        .get()
        .then(snapshot => {
          if (snapshot.empty) {
            db.collection('degrees')
              .add({
                degreeName: newUser.degree,
                uniName: newUser.uniName
              })
              .then(degreeRes => {
                userCredentials.degree = degreeRes.id
                return db.doc(`/users/${newUser.email}`).set(userCredentials)
              })
          } else {
            snapshot.forEach(doc => {
              userCredentials.degree = doc.id
            })
            return db.doc(`/users/${newUser.email}`).set(userCredentials)
          }
        })
    })
    .then(() => {
      console.log('COMING HERE: 3')
      return res.status(201).json({ token, email: newUser.email })
    })
    .catch(err => {
      console.error(err)
      if (err.code === 'auth/email-already-in-use') {
        return res.status(400).json({ error: 'Email is already is use' })
      } else {
        return res
          .status(500)
          .json({ error: 'Something went wrong, please try again', test: err })
      }
    })
})

// login route
app.post('/login', (req, res) => {
  const user = {
    email: req.body.email,
    password: req.body.password
  }

  firebase
    .auth()
    .signInWithEmailAndPassword(user.email, user.password)
    .then(data => {
      return data.user.getIdToken()
    })
    .then(token => {
      return res.json({ token, email: user.email })
    })
    .catch(err => {
      console.error(err)
      if (err.code === 'auth/wrong-password') {
        return res
          .status(403)
          .json({ error: 'Wrong credentials, please try again' })
      } else {
        return res.status(500).json({ error: err.code })
      }
    })
})

// get users route
app.get('/user', FBauth, (req, res) => {
  let userData = {}
  db.doc(`/users/${req.user.email}`)
    .get()
    .then(doc => {
      if (doc.exists) {
        userData = doc.data()
      }
      return res.json(userData)
    })
    .catch(err => {
      console.error(err)
      return res.status(500).json({ error: err.code })
    })
})

app.post('/user', (req, res) => {
  db.doc(`/users/${req.body.email}`)
    .get()
    .then(doc => {
      if (doc.exists) {
        return res.json({ error: 'Email already exists' })
      }
      return res.json({ general: 'ok' })
    })
    .catch(err => {
      console.error(err)
      return res.status(500).json({ error: err.code })
    })
})

app.post('/uni', (req, res) => {
  db.doc(`/universities/${req.body.uniName}`)
    .get()
    .then(doc => {
      if (doc.exists) {
        return res.json({ uniId: doc.id })
      } else {
        return res.json({ error: 'No matching universities' })
      }
    })
    .catch(err => {
      console.error(err)
      return res.status(500).json({ error: err.code })
    })
})

app.post('/subjects', (req, res) => {
  const subjectsRef = db.collection('subjects')
  subjectsRef
    .where('subjectCode', '==', req.body.subjectCode)
    .where('uniName', '==', req.body.uniName)
    .get()
    .then(snapshot => {
      if (snapshot.empty) {
        return res.json({
          error: 'No matching subject'
        })
      } else {
        snapshot.forEach(doc => {
          return res.json({
            subjectId: doc.id,
            subjectCode: doc.data().subjectCode
          })
        })
      }
    })
    .catch(err => {
      console.error(err)
      return res.status(500).json({ error: err.code })
    })
})

app.post('/degrees', (req, res) => {
  const degreesRef = db.collection('degrees')
  degreesRef
    .where('degreeName', '==', req.body.degreeName)
    .where('uniName', '==', req.body.uniName)
    .get()
    .then(snapshot => {
      if (snapshot.empty) {
        return res.json({
          error: 'No matching degree'
        })
      } else {
        snapshot.forEach(doc => {
          return res.json({
            degreeId: doc.id,
            degreeName: doc.data().degreeName
          })
        })
      }
    })
    .catch(err => {
      console.error(err)
      return res.status(500).json({ error: err.code })
    })
})

// const data = {
//   degreeName: 'Bachelor of Commerce',
//   uniName: 'University of New South Wales'
// }

// app.get('/degrees', (req, res) => {
//   db.collection('degrees')
//     .add(data)
//     .then(res => {
//       console.log(res.id)
//       return res.json({ id: res.id })
//     })
//     .catch(err => {
//       console.error(err)
//     })
// })

// const createSubjects = () => {
//   db.collection('subjects').add({
//     subjectCode: 'INFO3333',
//     uniName: 'University of Sydney'
//   })
//   db.collection('subjects').add({
//     subjectCode: 'INFO4001',
//     uniName: 'University of Sydney'
//   })
//   db.collection('subjects').add({
//     subjectCode: 'INFO4444',
//     uniName: 'University of Sydney'
//   })
// }

// createSubjects()

exports.api = functions.region('australia-southeast1').https.onRequest(app)
