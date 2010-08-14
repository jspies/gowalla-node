/**
 Gowalla API wrapper for node.js
 
 Copyright (c) 2010 Jonathan Spies MIT License
 
 The Gowalla API is really simple to use but I wanted some syntatic sugar because typing is lame.
 
 Gowalla uses a REST api and nests tons of their request, i.e. /users/id/pins, /spots/id/events etc
 This lib lets you mimic that. Example:
 
   user = gowalla.user("jspies", callback);
   user.stamps(callback);
 
 You can even chain it:
 
   gowalla.user("jspies").stamps(callback);
 
 In the chain above, no request is even made on the call to user() because there's no callback. However, you can callback:
 
   gowalla.user("jspies", callback).stamps(callback);
   
 And now with Spot searching:
 
   gowalla.spots(30.2697, -97.7494, 5).search("Torchy");
 
 */
var http = require('http');
var sys = require('sys');

module.exports = Gowalla;

function Gowalla(api, username, password) {
  this.API_KEY = api;
  
  this.baseURL = "api.gowalla.com";
  this.requestHeaders = {
    "Host": this.baseURL,
    "Accept": "application/json",
    "X-Gowalla-API-Key" : this.API_KEY
  };
  if (username && password) {
    this.set_user(username, password);
  }
  
  this.client = http.createClient(80, this.baseURL);
  
};

Gowalla.prototype = {

  user: function(username, callback) {
    var self = this; // save for nested Objects
    
    // If no one's going to do anything with it, let's not waste the request
    if (callback) {
      this._get('/users/'+username, callback);
    }
    
    function User(username) {
      this.base = "/users/"+username;
      this.username = username;
    };
    
    User.prototype = {
      // stamps takes a limit, but also takes a page if you want to page by 20
      // if you leave limit off, you get more info, like total entries and the ability to page
      stamps: function(callback, limit) {
        if (!limit || limit == 20) {
          self._get(this.base+'/stamps', callback);
        } else {
          self._get(this.base+'/stamps?limit='+limit, callback);
        }
      },
      pins: function(callback) {
        self._get(this.base+"/pins", callback);
      },
      trips: function(callback) {
        self._get(this.base+"/trips", callback);
      },
      items: function(callback) {
        self._get(this.base+"/items", callback);
      },
      topspots: function(callback) {
        self._get(this.base+"/topspots", callback);
      },
      photos: function(callback) {
        self._get(this.base+"/photos", callback);
      },
      friend_activity: function(callback) {
        self._get(this.base+"/activity/friends", callback);
      }
    }
    
    return new User(username);
  },
  
  spots: function(lat, lng, radius, callback) {
    var self = this; // save for nested Spots
    this._get('/spots/?lat='+lat+'&lng='+lng+'&radius='+radius, callback);
    
    function Spots(lat, lng, radius) {
      this.base = '/spots/?lat='+lat+'&lng='+lng+'&radius='+radius;
      this.lat = lat;
      this.lng = lng;
      this.radius = radius;
    }
    Spots.prototype = {
      search: function(str, callback) {
        self._get(this.base+"&q="+str, callback)
      }
    };
    return new Spots(lat, lng, radius);
  },
  
  spot: function(id, callback) {
    var self = this; // save for nested Objects
    if (callback) {
      this._get('/spots/'+id, callback);
    }
    
    function Spot(id) {
      this.base = "/spots/"+id;
      this.id = id;
    };
    Spot.prototype = {
      events: function(callback) {
        self._get(this.base+'/events', callback);
      },
      photos: function(callback) {
        self._get(this.base+'/photos', callback);
      },
      
      checkins: function(callback) {
        this.events(function(data) {
          var activity = new Array();
          for(var i=0;i<data.activity.length;i++) {
            if (data.activity[i].type == "checkin") {
              activity.push(data.activity[i]);
            }
          }
          callback.call(self, activity);
        });
      },
      
      items: function(callback) {
        self._get(this.base+'/items', callback);
      },
      
      flags: function(callback) {
        self._get(this.base+'/flags', callback);
      }
    }
    
    return new Spot(id);
  },
  
  flags: function(callback) {
    this._get("/flags", callback);
  },
  
  flag: function(id, callback) {
    this._get("/flag/"+id, callback);
  },
  
  categories: function(callback) {
    this._get("/categories", callback);
  },
  
  category: function(id, callback) {
    this._get("/category/"+id, callback);
  },
  
  item: function(id, callback) {
    this._get("/item/"+id, callback);
  },
  
  trips: function(callback) {
    this._get("/trips", callback);
  },
  
  trip: function(id, callback) {
    this._get("/trip/"+id, callback);
  },
  
  checkin: function(id, callback) {
    this._get("/checkin/"+id, callback);
  },
  
  /** You can store a user name so you don't have to call it all the time */
  set_user: function(username, password) {
    this.requestHeaders.Authorization = "Basic "+this._encode64(username+':'+password);
    this.username = username;
  },
    
  /** Anything past here is essentially a private function. That's why I used an underscore
   *  And also, get() is confusing since all the frameworks use that
   */
  
  /** a simple getter .builds the request and gets the data
      then just calls the callback
   */
  _get: function(path, callback) {
    var request = this.client.request('GET', path, this.requestHeaders);
    var self = this;
    var data = '';
  
    request.on('response', function(response) {
      response.setEncoding("utf8");
      response.on("data", function(bits) {
        data += bits;
      });
      
      response.on("end", function() {
        if (callback) {
          callback.call(self, JSON.parse(data));
        }
      });
    });
    request.end();
  },
  
  _encode64 : function (input) {
    var keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
		var output = "";
		var chr1, chr2, chr3, enc1, enc2, enc3, enc4;
		var i = 0;

		while (i < input.length) {

			chr1 = input.charCodeAt(i++);
			chr2 = input.charCodeAt(i++);
			chr3 = input.charCodeAt(i++);

			enc1 = chr1 >> 2;
			enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
			enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
			enc4 = chr3 & 63;

			if (isNaN(chr2)) {
				enc3 = enc4 = 64;
			} else if (isNaN(chr3)) {
				enc4 = 64;
			}

			output = output +
			keyStr.charAt(enc1) + keyStr.charAt(enc2) +
			keyStr.charAt(enc3) + keyStr.charAt(enc4);

		}

		return output;
	}
}
