var app = angular.module("connect4", []);

app.controller("game", function($scope){

	$scope.getPlayer = function(uid)
	{
		let promise = new Promise((resolve, reject) => {
			//now get the playerData for both players
			const playerRef = firebase.database().ref("users/" + uid);

			playerRef.once('value').then((playerSnapshot) => { 
				const playerData = playerSnapshot.val();
				const player = {name: "", id: "", rating: 0, colour: "#000000"};

				player.name = playerData.name;
				player.id = uid;
				player.rating = playerData.rating;
				player.colour = playerData.colour;

				resolve(player)
			});
		});
		return promise
	};

	$scope.embed = true;
    $scope.players = [{name: "Embed1", id: null, rating: null, colour: "#ff0000"}, {name: "Embed2", id: null, rating: null, colour: "#0000ff"}]; //embed by default

	$scope.currentColour = "";
    //we have the colours in the players var
	$scope.colour1 = "";
	$scope.colour2 = "";

	$scope.whoWon = "";
	$scope.currentPlayer = "";

	$scope.gameStarted = false;
	$scope.waiting = false;
	$scope.gameOver = false;
	$scope.inAnimation = false;

	//these variables are mostly because I can't access a lot of the data from the start game function inside the drop function, and I don't want to add a lot of parameters, just ignore them since it is just data from the startGame function
	$scope.uid = ""; //just need a global uid and p1p2 variable
	$scope.me = ""; //because we don't know whether we are player 1 or player 2
	$scope.otherPerson = "";
	$scope.otherPersonUID = "";
	$scope.myColour = "";
	$scope.otherPersonColour = "";
	$scope.gameID = "";

	$scope.startGame = function() //also the restart game function
	{
		$scope.waiting = false;
		$scope.gameStarted = false;

        //check if the game is in embed mode
        const urlString = window.location.href;
        const url = new URL(urlString);
        let embed = url.searchParams.get("embed") === 'true'; //have to use this method since Boolean(string) is unreliable
        if (embed == null) { embed = false; }
        
		$scope.embed = embed;

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
		let estimatedScale = scaleRatio * 100 - 10;
		if (estimatedScale < 45)
		{ estimatedScale = 45; }

		//site might also pass in a scale value, if not then use the estimated scale
		let scale = Number(url.searchParams.get("scale"));
		if (scale != 0) //only override if the user actually passes in a value
		{ const scalePercentage = scale * 100; document.getElementById("containerOuter").style.zoom = String(scalePercentage) + "%"; }
		else
		{ document.getElementById("containerOuter").style.zoom = String(estimatedScale) + "%"; }


        //if game is in embed mode (it is being played from an external source e.g. my operatingSystem website) then just take the playerData from the URL.
        if (embed == true)  //when it is in embed mode, you don't need an id since there is no backend
			{
			//when embedded is true, we want the user to be able to select a colour, so we show the .selectColour screen
			document.getElementById("selectColour").style.display = "grid";

			//colour is set by the colour pickers set at the front            

            //trying to make it as simple as possible when it is embeded:
            document.getElementById("container").style.width = "800px"; //only need 800px instead of 1300px as we don't have the side info any more
            $scope.$applyAsync();

            //when it is embeded we don't need the side cards (showing the 2 players), 
            document.getElementById("playerInfo").style.visibility = "hidden"; //hide cards
            document.getElementById("container").style.gridTemplateColumns = "100% 0%"; //make the connect4 grid container fill the entire screen, by changing the grid layout from 70% 30% to 100% 0%;

            document.getElementById("containerInner").style.paddingTop = "0px"; //removing padding
            document.getElementById("containerOuter").style.overflow = "hidden"; //dont need overflow since screen params will be managed externally

			$scope.gameStarted = true;

            //ABSOLUTE SMALLEST THE WINDOW CAN SUPPORT IS (740 X 1000)
        }
        else //get player objects from firebase (will do later)
        {
			$scope.gameStarted = false;
			$scope.waiting = true;

			checkUser().then((uid) => {
				$scope.uid = uid;
				//now that we have this uid we can use it to access the data from the database
				//first we have to get the gameID from the currentGame property in firebase
				const gameIDRef = firebase.database().ref("users/" + uid + "/currentGame");

				gameIDRef.once('value').then((gameIDSnapshot) => { 
					const gameID = gameIDSnapshot.val();
					$scope.gameID = gameID;
					
					//then use the gameID and get the game's data
					const gameDataRef = firebase.database().ref("games/" + gameID);
					gameDataRef.once('value').then((gameSnapshot) => { 
						const gameData = gameSnapshot.val();

						const player1UID = gameData.player1;
						const player2UID = gameData.player2;

						//get data for both players
						$scope.getPlayer(player1UID).then((value) => {
							$scope.players[0] = value;
							$scope.getPlayer(player2UID).then((value) => {
								$scope.players[1] = value;

								$scope.selectedColours(); //changing the colours
								$scope.$applyAsync();

								$scope.gameStarted = true;

								//once we have setup all of that we can setup the realtime listener keep listening to the currentMove
								const moveRef = firebase.database().ref("games/" + gameID + "/currentMove");
								moveRef.on('value', (snapshot) => {
									//when you recieve it check if it is your playerID, if not then it must be the other players so wait for the move
									const playerID = snapshot.val();
									
									if (playerID == uid)
									{
										$scope.waiting = false; //set waiting to false since it is our turn to move and we also need to access the drop function for the previous move
										
										//the other person has just moved so get their move from the database, check if you are player1 or player2
										var p1p2 = "";
										if (uid == player1UID) //you are player1 so you need to check in player2's database
										{ p1p2 = "player2"; $scope.me = "player1"; $scope.otherPersonUID = player2UID; }
										else
										{ p1p2 = "player1"; $scope.me = "player2"; $scope.otherPersonUID = player1UID; }
										$scope.otherPerson = p1p2;

										//we know it is our move, if $scope.me == "player1", then currentPlayer = $scope.players[0].name, otherwise it is $scope.players[1].name
										//now set the colour's for each person
										if ($scope.me == "player1")
										{ $scope.myColour = $scope.players[0].colour; $scope.otherPersonColour = $scope.players[1].colour; $scope.currentPlayer = $scope.players[0].name; }
										else
										{ $scope.myColour = $scope.players[1].colour; $scope.otherPersonColour = $scope.players[0].colour; $scope.currentPlayer = $scope.players[1].name; }
										$scope.$applyAsync();
										

										const previousMoveRef = firebase.database().ref("games/" + gameID + "/" + $scope.otherPerson + "PreviousMove");
										previousMoveRef.once('value').then((previousMoveSnapshot) => {
											const previousMove = previousMoveSnapshot.val();
											//it could be val meaning the other person hasn't had a move, in this case just ignore it
											if (previousMove != null) //when it is not null we need to add that move into our own grid
											{
												//set colour
												$scope.currentColour = $scope.otherPersonColour;
												$scope.drop(previousMove, false).then(() => {
													$scope.currentColour = $scope.myColour;
												});
											}
										});
									}

								});
							})
						})

					});

				});

				$scope.players = [{name: "Player 1", id: "213819904", rating: 1000, colour: "#ff0000"}, {name: "Player 2", id: "1324914", rating: 1025, colour: "#0000ff"}]; 


			}, (rejected) => {
				//not signed in, send back to index.html, where they will be redirected to dashboard
				location.href = "index.html";
			})
		}

        //we have the colours in the players var
        $scope.colour1 = $scope.players[0].colour;
        $scope.colour2 = $scope.players[1].colour;
		$scope.switchPlayer(); //to get the default colour

		$scope.gameOver = false;
		$scope.grid = [];
		i = 0;
		while (i != 6) //6 rows
		{ $scope.grid.push(["transparent", "transparent", "transparent", "transparent", "transparent", "transparent", "transparent"]); i += 1; }
	};
	$scope.selectedColours = function()
	{
		//after user has selected colours with the colour picker at the start (only in embedded mode)
		//hide the colour pickers
		document.getElementById("selectColour").style.display = "none";
		
		//reset the colours, since they are set when the game is run
		$scope.currentColour = "";
		$scope.colour1 = $scope.players[0].colour;
        $scope.colour2 = $scope.players[1].colour;
		$scope.switchPlayer();
		
	}

	$scope.switchPlayer = function()
	{
		//check current player (with colour)
		if ($scope.currentColour == $scope.colour1)
		{ $scope.currentColour = JSON.parse(JSON.stringify($scope.colour2)); }
		else if ($scope.currentColour == $scope.colour2)
		{ $scope.currentColour = JSON.parse(JSON.stringify($scope.colour1)); }
		else
		{ $scope.currentColour = JSON.parse(JSON.stringify($scope.colour1)); } //default colour
	};

	$scope.drop = function(column, postAfter) //postAfter is whether to post it to firebase after you have finished or not
	{
		let promise = new Promise((resolve, reject) => {
			if (postAfter == undefined)
			{ postAfter = true; }

			if ($scope.embed == false && $scope.waiting == true)
			{ return }

			if ($scope.gameOver == true || $scope.inAnimation == true || $scope.gameStarted == false)
			{ return; }

			//keeping looping through rows at column to find where there is a space
			var rowIndex = 0;
			try
			{ while ($scope.grid[rowIndex][column] == "transparent") {  rowIndex += 1; } }
			catch
			{}
			rowIndex -= 1;

			if (rowIndex < 0) //the column is full
			{
				alert("This column is full");
			}
			else
			{
				//just insert at row index using the animation function
				$scope.inAnimation = true;
				dropAnimation(rowIndex, column).then(() => {
					resolve("Moved")

					if (postAfter == true && $scope.embed == false)
					{
						setData("games/" + $scope.gameID + "/" + $scope.me + "PreviousMove", column).then(() => { //update your own previous move
							//and finally need to update the currentMove so the other person gets notified
							setData("games/" + $scope.gameID + "/currentMove", $scope.otherPersonUID).then(() => {
								$scope.waiting = true;

								//since you have just moved set $scope.currentPlayer to the other player
								if ($scope.me == "player1") //you are player1 so set the currentPlayer to the other person
								{ $scope.currentPlayer = $scope.players[1].name; }
								else
								{ $scope.currentPlayer = $scope.players[0].name; }
								$scope.$applyAsync();
							})
						})
					}

					const colourToCheck = JSON.parse(JSON.stringify($scope.currentColour)) //the currentColour will change while we are checking so we need a snapshot

					if ($scope.checkGrid(colourToCheck) == true)  //only need to check the colour that has just moved, as only that colour could have been modified
					{ 
						$scope.gameOver = true;
						console.log(`${colourToCheck} Wins`) //just have to display this instead of the currentColour, ill just do it with javascript:

						//game over sequence: since we have the colour data of the person who won, we will use that to check who won, this will break if 2 players have the same colour so Ill need to stop people with the same colour getting into a game
						var won = null;
						var lost = null;
						if ($scope.players[0].colour == colourToCheck)
						{ won = $scope.players[0]; lost = $scope.players[1]; }
						else
						{ won = $scope.players[1]; lost = $scope.players[0]; }

						$scope.whoWon = won.name;
						console.log(won)

						//now increase the rating by 25 when you win, and lose 25 when you loose (only if you are the host player)
						if ($scope.me == "player1")
						{
							setData("users/" + won.id + "/rating", won.rating + 25).then(() => {
								setData("users/" + lost.id + "/rating", lost.rating - 25).then(() => {});
							});
						}
					}
					else
					{
						if ($scope.embed == true)
						{
							$scope.switchPlayer(); 
						}
					}
				});
			}
		});
		return promise
	};
	
	function dropAnimation(endRow, column)
	{
		let promise = new Promise((resolve, reject) => {
			const distance = endRow;
			//add it in the first row
			$scope.grid[0][column] = $scope.currentColour;
			if (endRow == 0) //if it is 0 then it will cause an infinite loop otherwise
			{ $scope.inAnimation = false; resolve("Finished animation"); return; }

			var i = 0;
			var repeat = setInterval(function() {
				//now remove and add it in the column underneath until the loop breaks
				$scope.grid[i][column] = "transparent"
				$scope.grid[i + 1][column] = $scope.currentColour;
				$scope.$applyAsync(); //for some reason you need this since it doesnt automatically update

				i += 1;
				if (i == distance)
				{ $scope.inAnimation = false; clearInterval(repeat); resolve("Finished animation"); }
		}, 50);
		});
		return promise
	};

	$scope.checkGrid = function(colour)
	{
		//check the grid for the specified colour (red or blue) (now it is colour1 or colour2)
		//loop through all counters with the same colour, and check in each direction for 4 matching pairs

		var row = 0;
		while (row != $scope.grid.length)
		{
			var column = 0;
			while (column != $scope.grid[row].length)
			{
				//here is where we check every counter and its colour
				if ($scope.grid[row][column] == colour)
				{
					//check which directions are valid, for example if you are in (row: X, column: >3), then it will be impossible for you to have 4 in a row to the right
					//row index starts at index 0 at the top
					//you only need 1 check in a certain direction, you dont need right and left, and you dont need up and down

					var availableDirections = ["right", "down", "diagonal-up-right", "diagonal-up-left"]; //excluding diagonals for now to keep it simple
					if (column > 3) //right not available
					{ availableDirections.splice(availableDirections.indexOf("right"), 1); }
					if (row > 2) //down not available 
					{ availableDirections.splice(availableDirections.indexOf("down"), 1); }

					if (column > 3 || row < 3)
					{ availableDirections.splice(availableDirections.indexOf("diagonal-up-right"), 1); }
					if (column < 3|| row < 3)
					{ availableDirections.splice(availableDirections.indexOf("diagonal-down-right"), 1); }
				
					//now go through the availableDirections, get the counters in a line and check if they are all the same colour
					var i = 0;
					while (i != availableDirections.length)
					{
						const currentDirection = availableDirections[i];
						if (currentDirection == "right")
						{
							//when the current direction is left we just need to get the 3 items to the left of the currentCounter (including the current counter to make it clear)
							const counter1 = $scope.grid[row][column];
							const counter2 = $scope.grid[row][column + 1];
							const counter3 = $scope.grid[row][column + 2];
							const counter4 = $scope.grid[row][column + 3];

							if (counter1 == colour && counter2 == colour && counter3 == colour && counter4 == colour)
							{ return true; }
						}
						else if (currentDirection == "down")
						{
							const counter1 = $scope.grid[row][column];
							const counter2 = $scope.grid[row + 1][column];
							const counter3 = $scope.grid[row + 2][column];
							const counter4 = $scope.grid[row + 3][column];

							if (counter1 == colour && counter2 == colour && counter3 == colour && counter4 == colour)
							{ return true; }
						}
						else if (currentDirection == "diagonal-up-right")
						{
							const counter1 = $scope.grid[row][column];
							const counter2 = $scope.grid[row - 1][column + 1];
							const counter3 = $scope.grid[row - 2][column + 2];
							const counter4 = $scope.grid[row - 3][column + 3];

							if (counter1 == colour && counter2 == colour && counter3 == colour && counter4 == colour)
							{ return true; }
						}
						else if (currentDirection == "diagonal-up-left")
						{
							const counter1 = $scope.grid[row][column];
							const counter2 = $scope.grid[row - 1][column - 1];
							const counter3 = $scope.grid[row - 2][column - 2];
							const counter4 = $scope.grid[row - 3][column - 3];

							if (counter1 == colour && counter2 == colour && counter3 == colour && counter4 == colour)
							{ return true; }
						}

						i += 1;
					}

				}	
				column += 1;
			}
			row += 1;
		}

		return false; //it is hasnt returned true yet then there are no matches so return false
	};

	$scope.capitalise = function(word)
	{ return word.charAt(0).toUpperCase() + word.slice(1); };

});;