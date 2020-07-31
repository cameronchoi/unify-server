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

app.get('/test', (req, res) => {
  db.collection('test')
    .get()
    .then(data => {
      let tests = []
      data.forEach(doc => {
        tests.push({
          testId: doc.id,
          body: doc.data().body
        })
      })
      return res.json(tests)
    })
    .catch(err => console.error(err))
})

app.post('/test', (req, res) => {
  const newTest = {
    body: req.body.body
  }
  db.collection('test')
    .add(newTest)
    .then(doc => {
      res.json({ message: `document ${doc.id} created successfully` })
    })
    .catch(err => {
      res.status(500).json({ error: 'something went wrong' })
      console.error(err)
    })
})

//signup route
// app.post('/signup', (req, res) => {
//   const newUser = {
//     email: req.body.email,
//     password: req.body.password,
//     firstName: req.body.firstName,
//     lastName: req.body.lastName,
//     degree: req.body.degree,
//     uniName: req.body.uniName,
//     uniYear: req.body.uniYear,
//     describeSelf: req.body.describeSelf,
//     describeFriend: req.body.describeFriend,
//     avatar: {
//       clotheType: req.body.clotheType,
//       hairColour: req.body.hairColour,
//       skinColour: req.body.skinColour,
//       topType: req.body.topType
//     },
//     subjects: req.body.subjects
//   }

//   let token, userId
//   db.doc(`/users/${newUser.email}`)
//     .get()
//     .then(doc => {
//       if (doc.exists) {
//         return res.status(400).json({ email: 'This email is already taken' })
//       } else {
//         firebase
//           .auth()
//           .createUserWithEmailAndPassword(newUser.email, newUser.password)
//       }
//     })
//     .then(data => {
//       userId = data.user.uid
//       return data.user.getIdToken()
//     })
//     .then(idToken => {
//       token = idToken
//       const userDetails = {
//         userId,
//         firstName: newUser.firstName,
//         lastName: newUser.lastName,
//         degree: newUser.degree,
//         uniName: newUser.uniName,
//         uniYear: newUser.uniYear,
//         describeSelf: newUser.describeSelf,
//         describeFriend: newUser.describeFriend,
//         avatar: {
//           clotheType: newUser.avatar.clotheType,
//           hairColour: newUser.avatar.hairColour,
//           skinColour: newUser.avatar.skinColour,
//           topType: newUser.avatar.topType
//         },
//         subjects: newUser.subjects
//       }
//       return db.doc(`users/${newUser.email}`).set(userDetails)
//     })
//     .then(() => {
//       return res.status(201).json({ token })
//     })
//     .catch(err => {
//       console.error(err)
//       if (err.code === 'auth/email-already-in-use') {
//         res.status(400).json({ email: 'Email is already in use' })
//       } else {
//         return res.status(500).json({ error: err.code })
//       }
//     })

//   firebase
//     .auth()
//     .createUserWithEmailAndPassword(newUser.email, newUser.password)
//     .then(data => {
//       return res
//         .status(201)
//         .json({ message: `user ${data.user.uid} signed up successfully` })
//     })
//     .catch(err => {
//       console.error(err)
//       return res.status(500).json({ error: err.code })
//     })
// })

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
      userId = data.user.uid
      return data.user.getIdToken()
    })
    .then(idToken => {
      token = idToken
      const userCredentials = {
        userId,
        email: newUser.email,
        createdAt: new Date().toISOString(),
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        degree: newUser.degree,
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
      return db.doc(`/users/${newUser.email}`).set(userCredentials)
    })
    .then(() => {
      return res.status(201).json({ token })
    })
    .catch(err => {
      console.error(err)
      if (err.code === 'auth/email-already-in-use') {
        return res.status(400).json({ email: 'Email is already is use' })
      } else {
        return res
          .status(500)
          .json({ general: 'Something went wrong, please try again' })
      }
    })
})

exports.api = functions.region('australia-southeast1').https.onRequest(app)
