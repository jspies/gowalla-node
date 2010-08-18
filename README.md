# Gowalla API wrapper for node.js

http://gowalla.com/api.docs

The Gowalla API is really simple to use but I wanted some syntactic sugar because typing is lame.

## Usage
 
### Initialize

    gowalla = new Gowalla(API_KEY, YOUR_SECRET, (optional: username), (optional: password));
  
  The username and password are optional. You can get a lot out of the API without it.
  
### Querying
  
  Gowalla uses a REST api and nests tons of their request, i.e. /users/id/pins, /spots/id/events etc
  This lib lets you mimic that. Example:
 
    user = gowalla.user("jspies", callback);
    user.stamps(callback);
 
  You can even chain it:
 
    gowalla.user("jspies").stamps(callback);
 
  In the chain above, no request is even made on the call to user() because there's no callback. However, you can callback:
 
    gowalla.user("jspies", callback).stamps(callback);
   
### Searching

 You can search the spots you pull back from a lat/lng
 
    gowalla.spots(30.2697, -97.7494, 5).search("Torchy");
 
### Spot Checkin Listening

  You can setup up events on spots to tell you when someone checks in there.
  
    gowalla.spotPoller.add(10542, 10, function(checkin) {
      console.log(checkin.user.first_name+" is admiring the Mystery Gorilla");
    });
    
    gowalla.spotPoller.remove(10542); // when you tire of the Gorilla
    

### OAuth2 now, and checkins

   Here's an example using Express, a node.js framework, http://github.com/visionmedia/express

     app.get("/gowalla", function(req, res) {
       res.redirect(gowalla.authorize_url("http://my-website-of.awesome/gowalla/auth"));
     });

     app.get("/gowalla/auth", function(req, res) {
       var code = req.query.code;
       gowalla.get_access_token(code, "http://my-website-of.awesome/gowalla/auth", function(error, access_token, refresh_token) {
         if (error) {
           res.send("Error: "+ error);  
         } else {
           // you should save the access_token and refresh_token in your db if you want to make future requests
           res.redirect('/');
         }
       });
     });

   And now checkin

     gowalla.spot(197397).checkin({
       lat: 38.9085106333,
       lng: -77.21468345,
       comment: "I love checking in",
       post_to_twitter: true,
       post_to_facebook: false
     }, function(msg) {
       if (msg.error) {
         if (msg.error == "authorization_expired") {
           // need to refresh
         }
       } else {
         res.send(msg.detail_html);
       }
     }, test? put true here for testing);

## Example script:

    var Gowalla = require('./gowalla');
    var gowalla = new Gowalla("YOUR APIKEY", "YOUR SECRET");

    gowalla.user("jspies").stamps(function(data) {
      var num_stamps = data.stamps.length;
      for(var i=0;i<num_stamps;i++) {
        console.log(data.stamps[i].spot.name);
      }
    });

## What's Next?

Chain Gang Support

OAuth2 Client

Check-in over API
