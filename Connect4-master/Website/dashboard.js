var app = angular.module("connect4", []);

app.controller("dashboard", function($scope)
{
    $scope.displayName = "";
    $scope.emailAddress = "";
    $scope.password = "";

    $scope.authenticate = async function()
    {
        $scope.setupDashboard();
        checkUser().then((uid) => {
            //now that we have this uid we can use it to access the data from the database
            $scope.getPlayer(uid);

        }, (rejected) => {
            $scope.getPlayer(rejected);
        })
    }
    $scope.setupDashboard = function()
    {
        //try and scale it correctly (based on width)
		const width = window.innerWidth;
		let scaleRatio = 0;
		if (window.matchMedia("(orientation: portrait)").matches) {
			//portrait mode, so the width is 800px
			scaleRatio = width / 800;
		}
		else
		{
			//landscape mode, so the width is 1300px
			scaleRatio = width / 1300;
		}
		let estimatedScale = scaleRatio * 100 + 5;
		if (estimatedScale < 50)
		{ estimatedScale = 50; }
        if (estimatedScale > 115)
        { estimatedScale = 115; }
        
        document.getElementById("container").style.zoom = String(estimatedScale) + "%";
    }


    $scope.player = {name: "", id: "", rating: 0, colour: "#000000"};
    $scope.getPlayer = function(uid)
    {
        if (uid == null)
        {
            $scope.player = null;
            $scope.$applyAsync();
            return
        } 

        //use this after you have checked the player is logged in
        $scope.player.id = uid;
        
        //get all the data from firebase

        const nameRef = firebase.database().ref("users/" + uid + "/name");
        const ratingRef = firebase.database().ref("users/" + uid + "/rating");
        const colourRef = firebase.database().ref("users/" + uid + "/colour");

        nameRef.once('value').then((name) => { 
            $scope.player.name = name.val();
            ratingRef.once('value').then((rating) => { 
                $scope.player.rating = rating.val();
                colourRef.once('value').then((colour) => { 
                    $scope.player.colour = colour.val();
                    $scope.$applyAsync();

                    //we also have to set the player's currentGame to "Null", and remove any games which the player hosted
                    setData("users/" + uid + "/currentGame", "Null").then(() => {
                        const gameRef = firebase.database().ref("games/" + uid);
                        gameRef.remove().then(() => {})
                    }) 
                });  
            });  
        });
    };

    $scope.login = function(email, password)
    {
        console.log(`Sign in with ${$scope.emailAddress}`);

        firebase.auth().signInWithEmailAndPassword(email, password)
        .then(() => {
            // once you have signed in we need to reload the screen
            location.reload();
        })
        .catch((error) => {
            var errorMessage = error.message;
            alert(errorMessage);
        });
    };
    $scope.logout = function()
    {
        firebase.auth().signOut().then(() => {
            location.reload();
        }).catch((error) => {
            alert(error.message)
        });
    };

    $scope.signupClicked = function(displayName, email, password)
    {
        console.log(`Create account for ${$scope.displayName}, with email: ${$scope.emailAddress}`);

        firebase.auth().createUserWithEmailAndPassword(email, password).then((userCredential) => {

            const uid = userCredential.user.uid;
            //when we sign up we need to add some data in firebase
            setData("users/" + uid + "/name", displayName).then(() => {
                setData("users/" + uid + "/rating", 0).then(() => {
                    setData("users/" + uid + "/colour", "#ff0000").then(() => {
                        setData("users/" + uid + "/currentGame", "Null").then(() => {
                            // once you have signed in and added all the data we need to reload the screen
                            location.reload();
                        });
                    });                    
                });
            });
            
        }).catch((error) => {
            alert(error.message)
        });;
    };

    $scope.loginSignup = function() //just show the login signup popup
    { document.getElementById("loginSignupWrapper").style.display = "block"; };
    $scope.hideLoginSignup = function() //close the popup
    { document.getElementById("loginSignupWrapper").style.display = "none"; };
    $scope.showLogin = function()
    {
        $scope.displayName = "";
        $scope.emailAddress = "";
        $scope.password = "";
        document.getElementById("loginContent").style.display = "block";
        document.getElementById("signupContent").style.display = "none";
    };
    $scope.showSignup = function()
    {
        $scope.displayName = "";
        $scope.emailAddress = "";
        $scope.password = "";
        document.getElementById("loginContent").style.display = "none";
        document.getElementById("signupContent").style.display = "block";
    };

    $scope.findGame = function()
    {
        //the first thing to do is update the colour
        setData("users/" + $scope.player.id + "/colour", $scope.player.colour).then(() => {
            //make a queue system in firebase

            //when the user clicks find match, the game checks if there is anyone in the queue, if there is then just create a new game, with gameID of your uid, then set that person's currentGame to the gameID, and your own gameID to your uid

            document.getElementById("findMatchButton").disabled = true;

            const queueRef = firebase.database().ref("queue");
            queueRef.once('value').then((queueJSON) => {
                const uid = $scope.player.id;

                //parse the JSON
                var queue = JSON.parse(queueJSON.val());

                //check if the queue is empty
                if (queue.length == 0)
                {
                    //if it is empty add yourself to the queue, then start listening for a change in your currentGame
                    queue.push(uid);
                    const queueReturnJSON = JSON.stringify(queue);
                    setData("queue", queueReturnJSON).then(() => {

                        changed = 0;
                        const gameRef = firebase.database().ref("users/" + uid + "/currentGame");
                        gameRef.on('value', (snapshot) => {
                            console.log("Waiting in queue");
                            changed += 1; //the first time it is just getting the data, the second time is when it actually changes

                            if (changed == 2)
                            {
                                //when there is a change, go to the game.html, and you will can read the currentGam from there
                                location.href = "game.html";
                                console.log("changed")
                            }
                        });
                    });
                }
                else
                {
                    //if there is someone else in the queue, then create a new game, and set both of your currentGames to the gameID (which is your uid)
                    const gameID = uid;
                    const player1UID = uid;
                    const player2UID = queue[0];

                    const jsonData = { //just adding data underneath the game
                        currentMove: player1UID,
                        player1: player1UID,
                        player2: player2UID
                    };

                    //create new game
                    setData("games/" + gameID, jsonData).then(() => {

                        //set the currentGame of both users
                        setData("users/" + player1UID + "/currentGame", gameID).then(() => {
                            setData("users/" + player2UID + "/currentGame", gameID).then(() => {
                                //once you have added both we can delete the 2 players from the queue
                                const p1Index = queue.indexOf(player1UID);
                                queue.splice(p1Index, 1);
                                const p2Index = queue.indexOf(player2UID);
                                queue.splice(p2Index, 1);

                                const queueReturnJSON = JSON.stringify(queue);
                                //upload the new queue back to firebase
                                setData("queue", queueReturnJSON).then(() => {
                                    //then go to game.html (the gameID is stored in your user data in firebase)
                                    location.href = "game.html";
                                });
                            })
                        })

                    })
                }

            });
        });
    }
});