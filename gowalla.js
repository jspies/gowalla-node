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
 
 Gowalla-node includes a Spot Checkin Poller (takes an id, minutes and a callback):
 
   gowalla.spotPoller.add(9262, 10, function(checkin) {
     // do something, like make a robotic voice announce everyone that enters your store
     console.log(checkin);
   });
   
   gowalla.spotPoller.remove(9292);
   
 */
var http = require('http');
var events = require('events');
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
  this.spotPoller = new Gowalla_SpotPoller(this);
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
    this._get("/flags/"+id, callback);
  },
  
  categories: function(callback) {
    this._get("/categories", callback);
  },
  
  category: function(id, callback) {
    this._get("/categories/"+id, callback);
  },
  
  item: function(id, callback) {
    this._get("/items/"+id, callback);
  },
  
  trips: function(callback) {
    this._get("/trips", callback);
  },
  
  trip: function(id, callback) {
    this._get("/trips/"+id, callback);
  },
  
  checkin: function(id, callback) {
    this._get("/checkins/"+id, callback);
  },
  
  /** Hash options
      id, lat, lng, comment, post_twitter, post_facebook, test (boolean)
      
      Requires user to be authed
  */
  /*checkin: function(options, callback) {
    var path = "/checkins/";
    if (options.test) {
      path += "test"
    }
    this._post(path, function(data) {
      console.log(data);
    });
  },*/
  
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
    this._request('GET', path, null, callback);
  },
  
  _post: function(path, data, callback) {
    this._request('POST', path, data, callback);
  },
  
  _request: function(type, path, post_data, callback) {
    var request = this.client.request(type, path, this.requestHeaders);
    if (post_data)
      request.write(post_data);
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
};

var Gowalla_SpotWorker = function(poller, spot_id, minutes, callback) {
  this.poller = poller;
  this.minutes = minutes;
  this.callback = callback;
  this.id = spot_id;
  this.last_created_at = new Date();
    
  var self = this;
  this.interval = setInterval(function() {
    self.poller.emit("polling", spot_id);
    self.poller.gowalla.spot(spot_id).checkins(function(data) {
      var current = 0;
      while (clean_date(data[current].created_at) > self.last_created_at) {
        self.poller.emit("new checkin", data[current]);
        if (self.callback) {
          self.callback.call(self, data[current]);
        }
        if (current > 100) break; // safety valve
        current += 1;
      }
      self.last_created_at = clean_date(data[0].created_at);
    });
  }, 1000 * 3 * minutes); 
  
  function clean_date(str) {
    return new Date(str.replace("+", " +"));
  }
  
};

var Gowalla_SpotPoller = function(gowalla) {
  events.EventEmitter.call(this);
  this.gowalla = gowalla;
  this.workers = {};  
};

Gowalla_SpotPoller.super_ = events.EventEmitter;

Gowalla_SpotPoller.prototype = Object.create(events.EventEmitter.prototype);

Gowalla_SpotPoller.prototype.add = function(spot_id, minutes, callback) {
  var worker = new Gowalla_SpotWorker(this, spot_id, minutes, callback);
  this.workers[spot_id] = worker;
  this.emit('add', spot_id);
};

Gowalla_SpotPoller.prototype.remove = function(spot_id) {
  clearInterval(this.workers[spot_id].interval);
  this.workers[spot_id] = null;
};
