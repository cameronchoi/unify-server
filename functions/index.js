const functions = require('firebase-functions');
require('dotenv').config();
const admin = require('firebase-admin');
const express = require('express');
const app = express();

const PersonalityInsightsV3 = require('ibm-watson/personality-insights/v3');
const { IamAuthenticator } = require('ibm-watson/auth');

const personalityInsights = new PersonalityInsightsV3({
  version: '2017-10-13',
  authenticator: new IamAuthenticator({
    apikey: process.env.IBM_API_KEY,
  }),
  url:
    'https://api.au-syd.personality-insights.watson.cloud.ibm.com/instances/89379318-f4e6-4e38-8286-1c4e308351ee',
});

admin.initializeApp({
  credential: admin.credential.cert(require('./admin.json')),
});

const firebaseConfig = {
  apiKey: process.env.API_KEY,
  authDomain: 'unify-40e9b.firebaseapp.com',
  databaseURL: 'https://unify-40e9b.firebaseio.com',
  projectId: 'unify-40e9b',
  storageBucket: 'unify-40e9b.appspot.com',
  messagingSenderId: '721861398339',
  appId: '1:721861398339:web:3ee2cdb990e674a7cfe9f6',
  measurementId: 'G-RLMF7QHTJR',
};

const firebase = require('firebase');
const { firestore } = require('firebase-admin');
firebase.initializeApp(firebaseConfig);

const db = admin.firestore();

const FBauth = (req, res, next) => {
  let idToken;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer ')
  ) {
    idToken = req.headers.authorization.split('Bearer ')[1];
  } else {
    console.error('No token found');
    return res.status(403).json({ error: 'Unauthorized' });
  }

  admin
    .auth()
    .verifyIdToken(idToken)
    .then((decodedToken) => {
      req.user = decodedToken;
      return db
        .collection('users')
        .where('userId', '==', req.user.uid)
        .limit(1)
        .get();
    })
    .then((data) => {
      req.user.email = data.docs[0].data().email;
      return next();
    })
    .catch((err) => {
      console.error('Error while verifying token ', err);
      return res.status(403).json(err);
    });
};

const isEmpty = (string) => {
  if (string.trim() === '') return true;
  else return false;
};

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
    subjectIds: req.body.subjectIds,
  };

  let token, userId;
  db.doc(`/users/${newUser.email}`)
    .get()
    .then((doc) => {
      if (doc.exists) {
        return res.status(400).json({ email: 'this email is already taken' });
      } else {
        return firebase
          .auth()
          .createUserWithEmailAndPassword(newUser.email, newUser.password);
      }
    })
    .then((data) => {
      userId = data.user.uid;
      return data.user.getIdToken();
    })
    .then((idToken) => {
      token = idToken;
      const userCredentials = {
        userId,
        email: newUser.email,
        createdAt: new Date().toISOString(),
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        degree: {
          name: newUser.degreeName,
          id: newUser.degreeId,
        },
        uniName: newUser.uniName,
        uniYear: newUser.uniYear,
        describeSelf: newUser.describeSelf,
        describeFriend: newUser.describeFriend,
        avatar: {
          clotheType: newUser.clotheType,
          hairColour: newUser.hairColour,
          skinColour: newUser.skinColour,
          topType: newUser.topType,
        },
        subjects: {
          ids: newUser.subjectIds,
          codes: newUser.subjectCodes,
        },
        watsonInsights: {},
      };
      // use ibm watson to guage personality, values and needs
      let text = newUser.describeSelf.concat(newUser.describeFriend);

      personalityInsights
        .profile({
          content: text,
          contentType: 'text/plain',
          consumptionPreferences: false,
          rawScores: false,
        })
        .then((response) => {
          userCredentials.watsonInsights = response.result;
          return db.doc(`/users/${newUser.email}`).set(userCredentials);
        });
    })
    .then(() => {
      return res.status(201).json({ token, email: newUser.email });
    })
    .catch((err) => {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        return res.status(400).json({ error: 'Email is already is use' });
      } else {
        return res
          .status(500)
          .json({ error: 'Something went wrong, please try again', test: err });
      }
    });
});

// login route
app.post('/login', (req, res) => {
  const user = {
    email: req.body.email,
    password: req.body.password,
  };

  firebase
    .auth()
    .signInWithEmailAndPassword(user.email, user.password)
    .then((data) => {
      return data.user.getIdToken();
    })
    .then((token) => {
      return res.json({ token, email: user.email });
    })
    .catch((err) => {
      console.error(err);
      if (err.code === 'auth/wrong-password') {
        return res
          .status(403)
          .json({ error: 'Wrong credentials, please try again' });
      } else {
        return res.status(500).json({ error: err.code });
      }
    });
});

// get a list of available universities
app.get('/uni', (req, res) => {
  const universities = [];
  db.collection('/universities')
    .get()
    .then((snapshot) => {
      snapshot.forEach((doc) => {
        universities.push({ id: doc.id, ...doc.data() });
      });
      return res.json(universities);
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
});

// get a user without authorisation
app.get('/user/:email', (req, res) => {
  let userData = {};
  db.doc(`/users/${req.params.email}`)
    .get()
    .then((doc) => {
      if (doc.exists) {
        userData = doc.data();
      }
      return res.json(userData);
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
});

// get users route
app.get('/user', FBauth, (req, res) => {
  let userData = {};
  db.doc(`/users/${req.user.email}`)
    .get()
    .then((doc) => {
      if (doc.exists) {
        userData = doc.data();
      }
      return res.json(userData);
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
});

// find if email exists
app.post('/email', (req, res) => {
  db.doc(`/users/${req.body.email}`)
    .get()
    .then((doc) => {
      if (doc.exists) {
        return res.json({ error: 'Email already exists' });
      }
      return res.json({ general: 'ok' });
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
});

// find if subject exists
app.post('/subjects', (req, res) => {
  const subjectsRef = db.collection('subjects');
  subjectsRef
    .where('subjectCode', '==', req.body.subjectCode)
    .where('uniName', '==', req.body.uniName)
    .get()
    .then((snapshot) => {
      if (snapshot.empty) {
        return res.json({
          error: 'No matching subject',
        });
      } else {
        snapshot.forEach((doc) => {
          return res.json({
            subjectId: doc.id,
            subjectCode: doc.data().subjectCode,
          });
        });
      }
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
});

// find if degree exists
app.post('/degrees', (req, res) => {
  const degreesRef = db.collection('degrees');
  degreesRef
    .where('degreeName', '==', req.body.degreeName)
    .where('uniName', '==', req.body.uniName)
    .get()
    .then((snapshot) => {
      if (snapshot.empty) {
        return res.json({
          error: 'No matching degree',
        });
      } else {
        snapshot.forEach((doc) => {
          return res.json({
            degreeId: doc.id,
            degreeName: doc.data().degreeName,
          });
        });
      }
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
});

// get degree name singular
app.post('/degree', (req, res) => {
  db.doc(`/degrees/${req.body.degreeId}`)
    .get()
    .then((doc) => {
      if (doc.exists) {
        return res.json({ degreeName: doc.data().degreeName });
      } else {
        return res.json({ error: 'no degree with that id' });
      }
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
});

// utility function for finding the index of the person with the most similar personality, values, and needs
const findBestMatch = (myResponse, responses) => {
  let rank;
  let bestMatch;
  responses.forEach((response, index) => {
    let currentRank = 0;
    response.watsonInsights.personality.forEach((pers, i) => {
      const myPercentile = myResponse.watsonInsights.personality[i].percentile;
      const theirPercentile = pers.percentile;
      if (myPercentile > theirPercentile) {
        currentRank += myPercentile - theirPercentile;
      } else {
        currentRank += theirPercentile - myPercentile;
      }
    });
    response.watsonInsights.needs.forEach((need, i) => {
      const myPercentile = myResponse.watsonInsights.needs[i].percentile;
      const theirPercentile = need.percentile;
      if (myPercentile > theirPercentile) {
        currentRank += myPercentile - theirPercentile;
      } else {
        currentRank += theirPercentile - myPercentile;
      }
    });
    response.watsonInsights.values.forEach((value, i) => {
      const myPercentile = myResponse.watsonInsights.values[i].percentile;
      const theirPercentile = value.percentile;
      if (myPercentile > theirPercentile) {
        currentRank += myPercentile - theirPercentile;
      } else {
        currentRank += theirPercentile - myPercentile;
      }
    });
    if (index === 0) {
      rank = currentRank;
      bestMatch = index;
    } else {
      if (currentRank < rank) {
        rank = currentRank;
        bestMatch = index;
      }
    }
  });
  console.log(bestMatch);
  return bestMatch;
};

const createMatch = (matchOne, matchTwo) => {
  let userOne = {
    email: matchOne,
    avatar: {},
  };
  let userTwo = {
    email: matchTwo,
    avatar: {},
  };
  return new Promise((resolve, reject) => {
    db.doc(`users/${matchOne}`)
      .get()
      .then((doc) => {
        userOne.avatar.topType = doc.data().avatar.topType;
        userOne.avatar.hairColour = doc.data().avatar.hairColour;
        userOne.avatar.skinColour = doc.data().avatar.skinColour;
        userOne.avatar.clotheType = doc.data().avatar.clotheType;
        userOne.firstName = doc.data().firstName;
        userOne.lastName = doc.data().lastName;

        db.doc(`users/${matchTwo}`)
          .get()
          .then((doc) => {
            userTwo.avatar.topType = doc.data().avatar.topType;
            userTwo.avatar.hairColour = doc.data().avatar.hairColour;
            userTwo.avatar.skinColour = doc.data().avatar.skinColour;
            userTwo.avatar.clotheType = doc.data().avatar.clotheType;
            userTwo.firstName = doc.data().firstName;
            userTwo.lastName = doc.data().lastName;

            db.doc(`users/${matchOne}`).update({
              matches: admin.firestore.FieldValue.arrayUnion(matchTwo),
            });

            db.doc(`users/${matchTwo}`).update({
              matches: admin.firestore.FieldValue.arrayUnion(matchOne),
            });
            db.collection('matches')
              .add({
                createdAt: admin.firestore.Timestamp.now(),
                users: [matchOne, matchTwo],
                latestMessageTimestamp: admin.firestore.Timestamp.now(),
                latestMessage: 'No messages yet...',
                userInfo: { userOne, userTwo },
              })
              .then((docRef) => {
                console.log({ docId: docRef.id });
                resolve(docRef.id);
              });
          })
          .catch((err) => {
            console.log(err);
            res.status(400).json({ err });
          });
      })
      .catch((error) => {
        console.log(error);
        res.json({ error });
        reject(error);
      });
  });
};

// get a match
app.post('/match', FBauth, (req, res) => {
  const matchByDegree = req.body.degree;
  const matchBySubject = req.body.subject;
  const matchByPersonality = req.body.personality;

  db.doc(`/users/${req.user.email}`)
    .get()
    .then((doc) => {
      const firstUser = doc.data();

      if (matchByDegree && matchByPersonality && matchBySubject) {
        console.log('degree, pers, and subject');
        db.collection('users')
          .where('degree.id', '==', firstUser.degree.id)
          .where('subjects.ids', 'array-contains-any', firstUser.subjects.ids)
          .get()
          .then((snapshot) => {
            let results = [];
            snapshot.forEach((doc) => {
              results.push(doc.data());
            });
            let filtered = results.filter((item) => {
              if (
                firstUser.email === item.email ||
                firstUser.matches.includes(item.email)
              ) {
                return false;
              } else {
                return true;
              }
            });

            if (filtered.length === 0) {
              return res.json({
                error: 'No available matches. Please widen your match options.',
              });
            }

            const matchIndex = findBestMatch(firstUser, filtered);
            createMatch(firstUser.email, filtered[matchIndex].email).then(
              (docId) => {
                return res.json({
                  result: filtered[matchIndex],
                  id: docId,
                });
              }
            );
          });
      } else if (matchByDegree && matchByPersonality) {
        console.log('degree and pers');
        db.collection('users')
          .where('degree.id', '==', firstUser.degree.id)
          .get()
          .then((snapshot) => {
            let results = [];
            snapshot.forEach((doc) => {
              results.push(doc.data());
            });
            let filtered = results.filter((item) => {
              if (
                firstUser.email === item.email ||
                firstUser.matches.includes(item.email)
              ) {
                return false;
              } else {
                return true;
              }
            });

            if (filtered.length === 0) {
              return res.json({
                error: 'No available matches. Please widen your match options.',
              });
            }

            const matchIndex = findBestMatch(firstUser, filtered);
            createMatch(firstUser.email, filtered[matchIndex].email).then(
              (docId) => {
                return res.json({
                  result: filtered[matchIndex],
                  id: docId,
                });
              }
            );
          });
      } else if (matchBySubject && matchByPersonality) {
        console.log('subject and pers');

        db.collection('users')
          .where('subjects.ids', 'array-contains-any', firstUser.subjects.ids)
          .get()
          .then((snapshot) => {
            let results = [];
            snapshot.forEach((doc) => {
              results.push(doc.data());
            });
            let filtered = results.filter((item) => {
              if (
                firstUser.email === item.email ||
                firstUser.matches.includes(item.email)
              ) {
                return false;
              } else {
                return true;
              }
            });

            if (filtered.length === 0) {
              return res.json({
                error: 'No available matches. Please widen your match options.',
              });
            }

            const matchIndex = findBestMatch(firstUser, filtered);
            createMatch(firstUser.email, filtered[matchIndex].email).then(
              (docId) => {
                return res.json({
                  result: filtered[matchIndex],
                  id: docId,
                });
              }
            );
          });
      } else if (matchByDegree && matchBySubject) {
        console.log('degree and subject');
        db.collection('users')
          .where('degree.id', '==', firstUser.degree.id)
          .where('subjects.ids', 'array-contains-any', firstUser.subjects.ids)
          .get()
          .then((snapshot) => {
            let results = [];
            snapshot.forEach((doc) => {
              results.push(doc.data());
            });
            let filtered = results.filter((item) => {
              if (
                firstUser.email === item.email ||
                firstUser.matches.includes(item.email)
              ) {
                return false;
              } else {
                return true;
              }
            });

            if (filtered.length === 0) {
              return res.json({
                error: 'No available matches. Please widen your match options.',
              });
            }
            let result = filtered[Math.floor(Math.random() * filtered.length)];
            createMatch(firstUser.email, result.email).then((docId) => {
              return res.json({ result: result, id: docId });
            });
          });
      } else if (matchByDegree && !matchBySubject && !matchByPersonality) {
        console.log('just degree');
        db.collection('users')
          .where('degree.id', '==', firstUser.degree.id)
          .get()
          .then((snapshot) => {
            let results = [];
            snapshot.forEach((doc) => {
              results.push(doc.data());
            });
            let filtered = results.filter((item) => {
              if (
                firstUser.email === item.email ||
                firstUser.matches.includes(item.email)
              ) {
                return false;
              } else {
                return true;
              }
            });

            if (filtered.length === 0) {
              return res.json({
                error: 'No available matches. Please widen your match options.',
              });
            }
            let result = filtered[Math.floor(Math.random() * filtered.length)];
            createMatch(firstUser.email, result.email).then((docId) => {
              return res.json({ result: result, id: docId });
            });
          });
      } else if (!matchByDegree && matchBySubject && !matchByPersonality) {
        console.log('just subject');
        db.collection('users')
          .where('subjects.ids', 'array-contains-any', firstUser.subjects.ids)
          .get()
          .then((snapshot) => {
            let results = [];
            snapshot.forEach((doc) => {
              results.push(doc.data());
            });
            let filtered = results.filter((item) => {
              if (
                firstUser.email === item.email ||
                firstUser.matches.includes(item.email)
              ) {
                return false;
              } else {
                return true;
              }
            });

            if (filtered.length === 0) {
              return res.json({
                error: 'No available matches. Please widen your match options.',
              });
            }
            let result = filtered[Math.floor(Math.random() * filtered.length)];
            createMatch(firstUser.email, result.email).then((docId) => {
              return res.json({ result: result, id: docId });
            });
          });
      } else if (!matchByDegree && !matchBySubject && matchByPersonality) {
        console.log('just personality');
        db.collection('users')
          .get()
          .then((snapshot) => {
            let results = [];
            snapshot.forEach((doc) => {
              results.push(doc.data());
            });
            let filtered = results.filter((item) => {
              if (
                firstUser.email === item.email ||
                firstUser.matches.includes(item.email)
              ) {
                return false;
              } else {
                return true;
              }
            });

            if (filtered.length === 0) {
              return res.json({
                error: 'You have matched with everyone possible!.',
              });
            }

            let result = filtered[Math.floor(Math.random() * filtered.length)];
            createMatch(firstUser.email, result.email).then((docId) => {
              return res.json({ result: result, id: docId });
            });
          });
      } else if (!matchByDegree && !matchBySubject && !matchByPersonality) {
        console.log('No matching options');
        db.collection('users')
          .get()
          .then((snapshot) => {
            let results = [];
            snapshot.forEach((doc) => {
              results.push(doc.data());
            });
            let filtered = results.filter((item) => {
              if (
                firstUser.email === item.email ||
                firstUser.matches.includes(item.email)
              ) {
                return false;
              } else {
                return true;
              }
            });

            // console.log(filtered)
            if (filtered.length === 0) {
              return res.json({
                error: 'You have matched with everyone possible!.',
              });
            }

            const matchIndex = findBestMatch(firstUser, filtered);
            createMatch(firstUser.email, filtered[matchIndex].email).then(
              (docId) => {
                return res.json({
                  result: filtered[matchIndex],
                  id: docId,
                });
              }
            );
          });
      } else {
        return res.json({ error: 'you are not supposed to do this' });
      }
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
});

app.get('/matches', FBauth, (req, res) => {
  db.collection('matches')
    .where('users', 'array-contains', req.user.email)
    .orderBy('latestMessageTimestamp', 'desc')
    .get()
    .then((snapshot) => {
      let results = [];
      if (snapshot.isEmpty) {
        console.log('the snapshot is empty lol');
      }
      snapshot.forEach((doc) => {
        let info = {
          key: doc.id,
          match: doc.data(),
        };
        results.push(info);
      });
      return res.json({ results });
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
});

app.patch('/avatar', FBauth, (req, res) => {
  db.doc(`users/${req.user.email}`)
    .update({
      'avatar.topType': req.body.topType,
      'avatar.hairColour': req.body.hairColour,
      'avatar.skinColour': req.body.skinColour,
      'avatar.clotheType': req.body.clotheType,
    })
    .then((data) => {
      res.json({ data });
      db.collection('matches')
        .where('users', 'array-contains', req.user.email)
        .get()
        .then((snapshot) => {
          if (!snapshot.empty) {
            snapshot.forEach((doc) => {
              if (doc.data().userInfo.userOne.email === req.user.email) {
                doc.ref.update({
                  'userInfo.userOne.avatar': {
                    topType: req.body.topType,
                    hairColour: req.body.hairColour,
                    skinColour: req.body.skinColour,
                    clotheType: req.body.clotheType,
                  },
                });
              } else if (doc.data().userInfo.userTwo.email === req.user.email) {
                doc.ref.update({
                  'userInfo.userTwo.avatar': {
                    topType: req.body.topType,
                    hairColour: req.body.hairColour,
                    skinColour: req.body.skinColour,
                    clotheType: req.body.clotheType,
                  },
                });
              }
            });
          }
        });
    })
    .catch((err) => {
      res.json({ error: 'Something went wrong' });
    });
});

app.patch('/matches', (req, res) => {
  console.log(req.body.timestamp);
  db.doc(`matches/${req.body.id}`)
    .update({
      latestMessage: req.body.message,
      latestMessageTimestamp: admin.firestore.Timestamp.now(),
    })
    .then(res.status(200).json({ ok: 'cool it was created ' }))
    .catch((err) => {
      res.status(400).json({ err });
      console.log('uh oh');
    });
});

// app.post('/ibmtest', (req, res) => {
//     personalityInsights
//       .profile({
//         content: req.body.text,
//         contentType: 'text/plain',
//         consumptionPreferences: false,
//         rawScores: false
//       })
//       .then(response => {
//         res.json({ ok: response.result })
//         //   console.log(JSON.stringify(response.result, null, 2))
//       })
//       .catch(err => {
//         res.json({ error: err })
//         //   console.log('error:', err)
//       })
//   })

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

exports.api = functions.region('australia-southeast1').https.onRequest(app);
