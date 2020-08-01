const functions = require('firebase-functions')
require('dotenv').config()
const admin = require('firebase-admin')
const express = require('express')
const app = express()

const PersonalityInsightsV3 = require('ibm-watson/personality-insights/v3')
const { IamAuthenticator } = require('ibm-watson/auth')

const personalityInsights = new PersonalityInsightsV3({
  version: '2017-10-13',
  authenticator: new IamAuthenticator({
    apikey: process.env.IBM_API_KEY
  }),
  url:
    'https://api.au-syd.personality-insights.watson.cloud.ibm.com/instances/89379318-f4e6-4e38-8286-1c4e308351ee'
})

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
    degreeId: req.body.degreeId,
    degreeName: req.body.degreeName,
    uniName: req.body.uniName,
    uniYear: req.body.uniYear,
    describeSelf: req.body.describeSelf,
    describeFriend: req.body.describeFriend,
    clotheType: req.body.clotheType,
    hairColour: req.body.hairColour,
    skinColour: req.body.skinColour,
    topType: req.body.topType,
    subjectCodes: req.body.subjectCodes,
    subjectIds: req.body.subjectIds
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
        degree: {
          name: newUser.degreeName,
          id: newUser.degreeId
        },
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
        subjects: {
          ids: newUser.subjectIds,
          codes: newUser.subjectCodes
        },
        watsonInsights: {}
      }
      // use ibm watson to guage personality, values and needs
      let text = newUser.describeSelf.concat(newUser.describeFriend)

      personalityInsights
        .profile({
          content: text,
          contentType: 'text/plain',
          consumptionPreferences: false,
          rawScores: false
        })
        .then(response => {
          userCredentials.watsonInsights = response.result
          return db.doc(`/users/${newUser.email}`).set(userCredentials)
        })
    })
    .then(() => {
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

// find if email exists
app.post('/email', (req, res) => {
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

// find if university exists
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

// find if subject exists
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

// find if degree exists
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

// get degree name singular
app.post('/degree', (req, res) => {
  db.doc(`/degrees/${req.body.degreeId}`)
    .get()
    .then(doc => {
      if (doc.exists) {
        return res.json({ degreeName: doc.data().degreeName })
      } else {
        return res.json({ error: 'no degree with that id' })
      }
    })
    .catch(err => {
      console.error(err)
      return res.status(500).json({ error: err.code })
    })
})

app.post('/ibmtest', (req, res) => {
  personalityInsights
    .profile({
      content: req.body.text,
      contentType: 'text/plain',
      consumptionPreferences: false,
      rawScores: false
    })
    .then(response => {
      res.json({ ok: response.result })
      //   console.log(JSON.stringify(response.result, null, 2))
    })
    .catch(err => {
      res.json({ error: err })
      //   console.log('error:', err)
    })
})

// utility function for finding the index of the person with the most similar personality, values, and needs
const findBestMatch = (myResponse, responses) => {
  let rank
  let bestMatch
  responses.forEach((response, index) => {
    let currentRank = 0
    response.watsonInsights.personality.forEach((pers, i) => {
      const myPercentile = myResponse.watsonInsights.personality[i].percentile
      const theirPercentile = pers.percentile
      if (myPercentile > theirPercentile) {
        currentRank += myPercentile - theirPercentile
      } else {
        currentRank += theirPercentile - myPercentile
      }
    })
    response.watsonInsights.needs.forEach((need, i) => {
      const myPercentile = myResponse.watsonInsights.needs[i].percentile
      const theirPercentile = need.percentile
      if (myPercentile > theirPercentile) {
        currentRank += myPercentile - theirPercentile
      } else {
        currentRank += theirPercentile - myPercentile
      }
    })
    response.watsonInsights.values.forEach((value, i) => {
      const myPercentile = myResponse.watsonInsights.values[i].percentile
      const theirPercentile = value.percentile
      if (myPercentile > theirPercentile) {
        currentRank += myPercentile - theirPercentile
      } else {
        currentRank += theirPercentile - myPercentile
      }
    })
    console.log(currentRank)
    if (index === 0) {
      rank = currentRank
    } else {
      if (currentRank < rank) {
        rank = currentRank
        bestMatch = index
      }
    }
  })
  return bestMatch
}

// get a match
app.post('/match', FBauth, (req, res) => {
  const matchByDegree = req.body.matchByDegree
  const matchBySubject = req.body.matchBySubject
  const matchByPersonality = req.body.matchByPersonality

  db.doc(`/users/${req.user.email}`)
    .get()
    .then(doc => {
      const firstUser = doc.data()

      if (matchByDegree && matchByPersonality) {
        const degreeMatchRef = db
          .collection('users')
          .where('degree.id', '==', firstUser.degree.id)

        let results = []
        let result

        degreeMatchRef.get().then(snapshot => {
          if (snapshot.size == 2) {
            snapshot.forEach(doc => {
              if (doc.data().email !== req.user.email) result = doc.data()
            })
          } else if (snapshot.size > 2) {
            snapshot.forEach(doc => {
              if (doc.data().email !== req.user.email) results.push(doc.data())
            })
            console.log(results)
            const matchIndex = findBestMatch(firstUser, results)
            return res.json({ result: results[matchIndex] })
          }
        })

        // degreeMatchRef.get().then(snapshot => {
        //   if (snapshot.empty) {
        //     const subjectMatchRef = db
        //       .collection('users')
        //       .where('degree.id', '==', firstUser.degree.id)
        //   } else {
        //     snapshot.forEach(doc => {
        //       return res.json({
        //         subjectId: doc.id,
        //         subjectCode: doc.data().subjectCode
        //       })
        //     })
        //   }
        // })
      }
    })
    .catch(err => {
      console.error(err)
      return res.status(500).json({ error: err.code })
    })
})

app.post('/matches', (req, res) => {
  db.collection('matches')
    .add({
      users: [req.body.firstUser, req.body.secondUser],
      createdAt: new Date().toISOString()
    })
    .then(docRef => {
      res.json({ docId: docRef.id })
    })
})

app.get('/matches', FBauth, (req, res) => {
  //   console.log(req.user.email)
  db.collection('matches')
    .where('users', 'array-contains', req.user.email)
    .get()
    .then(snapshot => {
      let results = []
      if (snapshot.isEmpty) {
        console.log('the snapshot is empty lol')
      }
      let match = {
        name: null,
        topType: null,
        hairColour: null,
        skinColour: null,
        clotheType: null
      }
      snapshot.forEach(doc => {
        let userId = doc.data().users.filter(id => id !== req.user.email)
        db.doc(`/users/${userId[0]}`)
          .get()
          .then(matchDoc => {
            console.log(matchDoc)
            match.createdAt = matchDoc.data().createdAt
            match.users = matchDoc.data().users
            match.name = matchDoc
              .data()
              .firstName.concat(matchDoc.data().lastName)
            match.topType = matchDoc.data().avatar.topType
            match.hairColour = matchDoc.data().avatar.hairColour
            match.skinColour = matchDoc.data().avatar.skinColour
            match.clotheType = matchDoc.data().avatar.clotheType
          })
        results.push(match)
      })
      return res.json({ results })
    })
    .catch(err => {
      console.error(err)
      return res.status(500).json({ error: err.code })
    })
})

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
