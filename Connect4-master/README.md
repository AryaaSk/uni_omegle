## Note: Recently switched from firebase hosting, to azure hosting so there may be some bugs related to the embedded mode

# Connect4

## I am writing this in AngularJS instead of Angular so I can have the ability to work on this at school, since terminal is blocked there.
This is very poorly written since I prioritized time over quality and I probably won't come back to this in the near future.

This is basically just a regular Connect4 game, where users can create profiles and keep a rating. There is also an embeded mode, so other people can just add this to their website for games and things.

Here are some previews:
![Preview1](https://github.com/AryaaSk/Other-Projects/blob/main/Previews/connect41.png?raw=true)

![Preview2](https://github.com/AryaaSk/Other-Projects/blob/main/Previews/connect43.png?raw=true)

## Game Ideas:
Users can have a specific colour counter when they join, and they can change it (maybe every week or something).
There can be more than 2 people, for example you can have 4 people playing on a bigger board.

## Hosting
Used to use firebase to host but it was buggy especially while using firebase authentication for some reason, so I switch to azure static websites\
OLD URL: https://connect4-863d1.web.app \
New URL: https://aryaaconnect4.z33.web.core.windows.net

*The Old URL will still be available for a little bit until I migrate everything to the new URL*

## Embeded:
*Not able to change to new URL, as I made it mobile friendly but in the process also broke the embedded view, if you want the version which works just go back in history and find the version on March 2nd 2022 (I haven't checked but this is the version before I make it responsive so it should work)*

Use this URL to access the embed mode: https://connect4-863d1.web.app/game.html?embed=true

The minimum width and height is: 740px X 1000px\
If this is too large or too small for you, you can also add an optional scale parameter, 0.5 will apply a 50% scale, 2 will apply a 200% scale.\
Here is an example of a URL with scale: https://connect4-863d1.web.app/game.html?embed=true&&scale=0.5

Here is an example to just add to your HTML:
```
<iframe  style="height: 1000px; width: 740px" src="https://connect4-863d1.web.app/game.html?embed=true&&scale=1"></iframe>
```

Here is a preview of the embedded version:

![Preview1](https://github.com/AryaaSk/Other-Projects/blob/main/Previews/conenct4.png?raw=true)
