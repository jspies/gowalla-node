# Gowalla API wrapper for node.js

http://gowalla.com/api.docs

The Gowalla API is really simple to use but I wanted some syntactic sugar because typing is lame.

## Usage
 
### Initialize
    gowalla = new Gowalla(API_KEY, (optional: username), (optional: password));
  
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
 

## Example script:

    var Gowalla = require('./gowalla');
    var gowalla = new Gowalla("YOUR APIKEY");

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

Spot polling