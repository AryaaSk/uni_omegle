const firebaseConfig = {
    apiKey: "AIzaSyB5H7LsqptV5ycqWXu1fz6qqTmMGsCoA5Q",
    authDomain: "connect4-863d1.firebaseapp.com",
    databaseURL: "https://connect4-863d1-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "connect4-863d1",
    storageBucket: "connect4-863d1.appspot.com",
    messagingSenderId: "920653652903",
    appId: "1:920653652903:web:97fe317ef24bcbcc7a4c82"
  };

firebase.initializeApp(firebaseConfig);

async function checkUser()
{
    let promise = new Promise(function(resolve, reject) {
        firebase.auth().onAuthStateChanged((user) => {
            if (user) {
                resolve(user.uid);
            } else {
                reject(null);
            }
        });
    });
    return promise;
};

async function setData(key, data)
{
    let promise = new Promise(function(resolve, reject) {
        firebase.database().ref(key).set(data).then(function onSuccess(res) {
            console.log(`Added ${data} at key: ${key}`);
            resolve("Done")
          });
    });
    return promise;
};

async function getData(key)
{
    let promise = new Promise(function(resolve, reject) {
        const reference = firebase.database().ref(key);
        reference.on('value', (snapshot) => {
            resolve(snapshot.val())
        });
    });
    return promise;
}