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
 
 Gowalla-node includes a Poller to simulate a listen for new activity (takes minutes, a start date and a callback):
 (currently on items and spots, could be added to users too)
 
   gowalla.spot(9262).poll(10, "May 10, 2010", function(checkin) {
     // do something, like make a robotic voice announce everyone that enters your store
     console.log(checkin);
   });
   
   gowalla.spot(9262).stop();
   
  OAuth2 now, and checkins
  
  Here's an example using Express, a node.js framework, http://github.com/visionmedia/express
  
    app.get("/gowalla", function(req, res) {
      res.redirect(gowalla.authorize_url("http://localhost:3000/gowalla/auth"));
    });

    app.get("/gowalla/auth", function(req, res) {
      var code = req.query.code;
      gowalla.get_access_token(code, "http://localhost:3000/gowalla/auth", function(error, access_token, refresh_token) {
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
     
 */
var http = require('http');
var events = require('events');
var sys = require('sys');
var querystring = require('querystring');
var OAuth2 = require('node-oauth/lib/oauth2').OAuth2;

module.exports = Gowalla;

function Gowalla(api, secret, username, password) {
  this.API_KEY = api;
  
  this.baseURL = "api.gowalla.com";
  this.baseOAuthURL = "https://gowalla.com/api/oauth"

  this.requestHeaders = {
    "Host": this.baseURL,
    "Accept": "application/json",
    "X-Gowalla-API-Key" : this.API_KEY
  };
  if (username && password) {
    this.set_user(username, password);
  }
  
  this.client = http.createClient(80, this.baseURL);
  this.poller = new Gowalla_Poller(this);
  
  // OAuth stuff
  this.oauth = new OAuth2(api, secret, "https://gowalla.com/api/oauth", "/new", "/token");
  this._authorize_url = this.baseOAuthURL+"/new";
  this._access_url = "";
  this._access_token = "";
  this._refresh_token = "";
};

Gowalla.prototype = {
  // generic for sending urls. mostly because the gowalla API sends back urls instead of IDs
  url: function(url, callback) {
    this._get(url, callback);
  },

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
      last_checkin: function(callback) {
        self._get(this.base, function(data) {
          if (data.last_checkins) {
            callback(data.last_checkins[0]);
          } else {
           callback(data);
          }
        });
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
    if (callback) {
      this._get('/spots/?lat='+lat+'&lng='+lng+'&radius='+radius, callback);
    }
    
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
      this.poll_id;
    };
    Spot.prototype = {
      events: function(callback) {
        self._get(this.base+'/events', callback);
      },
      photos: function(callback) {
        self._get(this.base+'/photos', callback);
      },
      poll: function(minutes, start_date, callback) {
        this.poll_id = self.poller.add(this.base+"/checkins", minutes, start_date, callback);
      },
      stop: function() {
        self.poller.remove(this.poll_id);
      },
      
      /** Check in! Please don't abuse. Gowalla will suck if people check in remotely. Seriously suck.
        Requirements:
          Must have used OAuth
          lat
          lng
        Optional
          comment
          post_to_twitter and post_to_facebook will default to false
       */
      checkin: function(options, callback, test) {
        if (!self._access_token) {
          callback("No Access");
          return false;
        }
        if (!options.lat || !options.lng) {
          callback("missing lat lng");
          return false;
        }
        if (!options.comment) options.comment = "";
        if (!options.post_to_twitter) options.post_to_twitter = false;
        if (!options.post_to_facebook) options.post_to_facebook = false;
        var path = "/checkins/";
        if (test) {
          path += "test";
        }
        options.spot_id = this.id;
        self._post(path, options, function(data) {
          callback(data);
        });
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
    var self = this; // save for nested Objects
    if (callback) {
      this._get("/items/"+id, callback);
    }
    
    function Item(id) {
      this.base = "/items/"+id;
      this.id = id;
      this.poll_id;
    };
    Item.prototype = {
      poll: function(minutes, start_date, callback) {
        this.poll_id = self.poller.add(this.base+"/activity", minutes, start_date, callback);
      },
      stop: function() {
        self.poller.remove(this.poll_id);
      }
    };
    return new Item(id);
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
  
  /** OAuth Stuff */
  refresh_token: function() {
    return this._refresh_token;
  },
  
  authorize_url: function(redirect_uri) {
    return this._authorize_url+"?redirect_uri="+redirect_uri+"&client_id="+this.API_KEY+"&scope=read-write";
  },
  
  get_access_token: function(code, redirect_uri, callback) {
    var self = this;
    this.oauth.getOAuthAccessToken(code, {'grant_type':'authorization_code', 'redirect_uri': redirect_uri, scope: "read-write"}, function(error, access_token, refresh_token, data) {
      if (!error) {
        self.set_oauth();
        self._access_token = access_token;
        self._refresh_token = refresh_token;
        self.username = data.username;
      }
      
      callback(error, access_token, refresh_token);
    });
  },
  
  /** Yeah... this is untested, feel free to make sure it works :) */
  refresh_access_token: function(refresh_token, redirect_uri, callback) {
    var self = this;
    this.oauth.refreshOAuthToken(refresh_token, {}, function(error, access_token, refresh_token, data) {
      if (!error) {
        self.set_oauth();
        self._access_token = access_token;
        self._refresh_token = refresh_token;
        self.username = data.username;
      }
      callback(error, access_token, refresh_token);
    });
  },
  
  /** You can store a user name so you don't have to call it all the time */
  set_user: function(username, password) {
    this.requestHeaders.Authorization = "Basic "+this._encode64(username+':'+password);
    this.username = username;
  },
  
  set_oauth: function() {
    if (this.requestHeaders.Authorization) {
      this.requestHeaders.Authorization = null;
    }
    this.client = http.createClient(443, this.baseURL, true);
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
  
  build_path: function(path, type) {
    if (this._access_token && type == "GET") {
      this.baseURL = "https://"+this.baseURL;
      if (type == "GET") {
        if (path.indexOf('?') > -1) {
          path += "&oauth_token="+this._access_token;
        } else {
          path += "?oauth_token="+this._access_token;
        }
      }
    }
    return path;
  },
  
  _request: function(type, path, post_data, callback) {
    var self = this;
    var headers = this.requestHeaders;
    
    if (post_data) {
      post_data.oauth_token = this._access_token;
      post_data = querystring.stringify(post_data);
      headers['Content-Length'] = post_data.length;
    }
    var request = this.client.request(type, this.build_path(path), headers);
    if (post_data) { 
      request.write(post_data, "ascii");
    }
    var data = '';
    request.on('response', function(response) {
      // maybe we should return an error is status not 200 range
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

var Gowalla_Worker = function(poller, path, minutes, start_date, callback) {
  this.poller = poller;
  this.minutes = minutes;
  this.callback = callback;
  this.id = path;
  this.path = path;
  if (start_date) {
    this.last_created_at = new Date(start_date);
  } else {
    this.last_created_at = new Date();
  }
    
  var self = this;
  this.interval = setInterval(function() {
    self.poller.emit("polling", this.id);
    self.poller.gowalla._get(path, function(data) {
      var current = 0;
      events = data.events;
      while (current < events.length && clean_date(events[current].created_at) > self.last_created_at) {
        self.poller.emit("new event", events[current]);
        if (self.callback) {
          self.callback.call(self, events[current]);
        }
        if (current > 100) break; // safety valve
        current += 1;
      }
      self.last_created_at = clean_date(events[0].created_at);
    });
  }, 1000 * 60 * minutes); 
  
  function clean_date(str) {
    return new Date(str.replace("+", " +"));
  }
  
};

// i'd like to say gowalla.spot(34534).poll(function() {});
var Gowalla_Poller = function(gowalla) {
  events.EventEmitter.call(this);
  this.gowalla = gowalla;
  this.workers = {};  
};

Gowalla_Poller.super_ = events.EventEmitter;

Gowalla_Poller.prototype = Object.create(events.EventEmitter.prototype);

Gowalla_Poller.prototype.add = function(path, minutes, start_date, callback) {
  var worker = new Gowalla_Worker(this, path, minutes, start_date, callback);
  var id = this.workers.length
  this.workers[id] = worker;
  this.emit('add', id);
  return id;
};

Gowalla_Poller.prototype.remove = function(id) {
  clearInterval(this.workers[id].interval);
  this.workers[id] = null;
};