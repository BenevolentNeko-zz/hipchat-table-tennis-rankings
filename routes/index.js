var http = require('request');
var cors = require('cors');
var uuid = require('uuid');
var url = require('url');

// This is the heart of your HipChat Connect add-on. For more information,
// take a look at https://developer.atlassian.com/hipchat/tutorials/getting-started-with-atlassian-connect-express-node-js
module.exports = function (app, addon) {
  var hipchat = require('../lib/hipchat')(addon);

  // simple healthcheck
  app.get('/healthcheck', function (req, res) {
    res.send('OK');
  });

  // Root route. This route will serve the `addon.json` unless a homepage URL is
  // specified in `addon.json`.
  app.get('/',
    function (req, res) {
      // Use content-type negotiation to choose the best way to respond
      res.format({
        // If the request content-type is text-html, it will decide which to serve up
        'text/html': function () {
          var homepage = url.parse(addon.descriptor.links.homepage);
          if (homepage.hostname === req.hostname && homepage.path === req.path) {
            res.render('homepage', addon.descriptor);
          } else {
            res.redirect(addon.descriptor.links.homepage);
          }
        },
        // This logic is here to make sure that the `addon.json` is always
        // served up when requested by the host
        'application/json': function () {
          res.redirect('/atlassian-connect.json');
        }
      });
    }
    );

  // This is an example route that's used by the default for the configuration page
  // https://developer.atlassian.com/hipchat/guide/configuration-page
  app.get('/config',
    // Authenticates the request using the JWT token in the request
    addon.authenticate(),
    function (req, res) {
      // The `addon.authenticate()` middleware populates the following:
      // * req.clientInfo: useful information about the add-on client such as the
      //   clientKey, oauth info, and HipChat account info
      // * req.context: contains the context data accompanying the request like
      //   the roomId
      res.render('config', req.context);
    }
    );

  // This is an example glance that shows in the sidebar
  // https://developer.atlassian.com/hipchat/guide/glances
  app.get('/glance',
    cors(),
    addon.authenticate(),
    function (req, res) {
      res.json({
        "label": {
          "type": "html",
          "value": "Hello World!"
        },
        "status": {
          "type": "lozenge",
          "value": {
            "label": "NEW",
            "type": "error"
          }
        }
      });
    }
    );

  // This is an example end-point that you can POST to to update the glance info
  // Room update API: https://www.hipchat.com/docs/apiv2/method/room_addon_ui_update
  // Group update API: https://www.hipchat.com/docs/apiv2/method/addon_ui_update
  // User update API: https://www.hipchat.com/docs/apiv2/method/user_addon_ui_update
  app.post('/update_glance',
    cors(),
    addon.authenticate(),
    function (req, res) {
      res.json({
        "label": {
          "type": "html",
          "value": "Hello World!"
        },
        "status": {
          "type": "lozenge",
          "value": {
            "label": "All good",
            "type": "success"
          }
        }
      });
    }
    );

  // This is an example sidebar controller that can be launched when clicking on the glance.
  // https://developer.atlassian.com/hipchat/guide/dialog-and-sidebar-views/sidebar
  app.get('/sidebar',
    addon.authenticate(),
    function (req, res) {
      res.render('sidebar', {
        identity: req.identity
      });
    }
    );

  // This is an example dialog controller that can be launched when clicking on the glance.
  // https://developer.atlassian.com/hipchat/guide/dialog-and-sidebar-views/dialog
  app.get('/dialog',
    addon.authenticate(),
    function (req, res) {
      res.render('dialog', {
        identity: req.identity
      });
    }
    );

  // Sample endpoint to send a card notification back into the chat room
  // See https://developer.atlassian.com/hipchat/guide/sending-messages
  app.post('/send_notification',
    addon.authenticate(),
    function (req, res) {
      var card = {
        "style": "link",
        "url": "https://www.hipchat.com",
        "id": uuid.v4(),
        "title": req.body.messageTitle,
        "description": "Great teams use HipChat: Group and private chat, file sharing, and integrations",
        "icon": {
          "url": "https://hipchat-public-m5.atlassian.com/assets/img/hipchat/bookmark-icons/favicon-192x192.png"
        }
      };
      var msg = '<b>' + card.title + '</b>: ' + card.description;
      var opts = { 'options': { 'color': 'yellow' } };
      hipchat.sendMessage(req.clientInfo, req.identity.roomId, msg, opts, card);
      res.json({ status: "ok" });
    }
    );

  // This is an example route to handle an incoming webhook
  // https://developer.atlassian.com/hipchat/guide/webhooks

  var players = [];

  function rankDown(playerID){
    var currentPosition = players.indexOf(playerID);
    var newPosition = currentPosition + 1;
    if (newPosition < players.length){
      players[currentPosition] = players[newPosition];
      players[newPosition] = playerID;
    }
  }
  function rankUp(playerID){
    var currentPosition = players.indexOf(playerID);
    var newPosition = currentPosition - 1;
    if (newPosition >= 0){
      players[currentPosition] = players[newPosition];
      players[newPosition] = playerID;
    }
  }
  function addNewPlayerAtPosition(playerID, position){
    players.splice(position, 0, playerID);
  }

  function updateRankings(winner, loser){
    var winnerRanking = players.indexOf(winner);
    var loserRanking = players.indexOf(loser);

    if (winnerRanking === -1 && loserRanking === -1){
      // Neither player on board. Add winner and loser.
      players.push(winner);
      players.push(loser);
    } else if (winnerRanking >= 0 && loserRanking >= 0){
      // Both players on the board
      if (winnerRanking > loserRanking){
         rankUp(winner);
         rankDown(loser);
      }
    } else if (winnerRanking >=0 && loserRanking === -1) {
      players.push(loser);
    } else if (winnerRanking === -1 && loserRanking >= 0){
      addNewPlayerAtPosition(winner, loserRanking);
    }
  }

  function buildTTMessage(mentions, requestMessage){
    if (mentions instanceof Array){
      if (mentions.length === 2){
        var winner = mentions[0];
        var loser = mentions[1];
        if (requestMessage.indexOf(mentions[0].mention_name) > requestMessage.indexOf(mentions[1].mention_name)){
          winner = mentions[1];
          loser = mentions[0];
        }

        var winningMessage = "Well done " + winner.name + "!";
        var losingMessage = "Better luck next time " + loser.name + "!";

        updateRankings(winner.name, loser.name);

        return winningMessage + "</br >" + losingMessage;
      }
      throw "The 2 players should be tagged with their @MentionName."
    }
    throw "Something is wrong with the formatting there.";
  }


  app.post('/webhook',
    addon.authenticate(),
    function (req, res) {
      var message;
      var messageColor = "green";
      var options = {
        options: {
          color: messageColor
        }
      };
      var requestMessage = req.body.item.message.message;
      var mentions = req.body.item.message.mentions;
      var commands = requestMessage.split(" ");


      try {
        if (commands.length === 2 && commands[1].toLowerCase() === "rankings"){
          message = "<b>Player rankings currently stand at:</b><ol>"
          for (var i = 0; i < players.length; i++){
            message += "<li>" + players[i] + "</li>";
          }
          message += "</ol>";
          messageColor = "orange";
          console.log(message);
        } else {
          message = buildTTMessage(mentions, requestMessage);
        }
        console.log(players);
      } catch (errorMessage) {
        message = errorMessage + " Try: <br />/TT @Winner beats @Loser";
        messageColor = "red";
      }

      hipchat.sendMessage(req.clientInfo, req.identity.roomId, message, {options: {color: messageColor}})
        .then(function (data) {
          res.sendStatus(200);
        }).catch(function(err){
          console.log(err);
        });
    }
    );

  // Notify the room that the add-on was installed. To learn more about
  // Connect's install flow, check out:
  // https://developer.atlassian.com/hipchat/guide/installation-flow
  addon.on('installed', function (clientKey, clientInfo, req) {
    var installedMessage = 'The ' + addon.descriptor.name + ' add-on has been installed in this room';
    var options = {
      options: {
        color: "yellow"
      }
    }
    hipchat.sendMessage(clientInfo, req.body.roomId, installedMessage, options);
  });


  // Clean up clients when uninstalled
  addon.on('uninstalled', function (id) {
    addon.settings.client.keys(id + ':*', function (err, rep) {
      rep.forEach(function (k) {
        addon.logger.info('Removing key:', k);
        addon.settings.client.del(k);
      });
    });
  });

};
