'use strict'
const config=require('./config');
const express = require('express')
const bodyParser = require('body-parser')
const request = require('request')
const app = express()
const pg=require('pg');
const keyword_extractor = require('keyword-extractor')
const Crawler = require("js-crawler");
const cheerio = require('cheerio');
const URL = require('url-parse');
const crypto = require('crypto');
const uuid = require('uuid');
const userData= require('./user');


// Messenger API parameters
if (!config.FB_PAGE_TOKEN) {
	throw new Error('missing FB_PAGE_TOKEN');
}
if (!config.FB_VERIFY_TOKEN) {
	throw new Error('missing FB_VERIFY_TOKEN');
}
if (!config.FB_APP_SECRET) {
	throw new Error('missing FB_APP_SECRET');
}
if (!config.SERVER_URL) { //used for ink to static files
	throw new Error('missing SERVER_URL');
}
if (!config.PG_CONFIG) { //used for ink to static files
	throw new Error('missing PG_CONFIG');
}


pg.defaults.ssl=true;

app.set('port', (process.env.PORT || 5000))

//verify request came from facebook
app.use(bodyParser.json({
	verify: verifyRequestSignature
}));

//serve static files in the public directory
app.use(express.static('public'));

// Process application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({extended: false}))

// Process application/json
app.use(bodyParser.json())

const sessionIds = new Map();
const userMap=new Map;

// Index route
app.get('/', function (req, res) {
    res.send('Hello world, I am a chat bot')
})

// for Facebook verification
app.get('/webhook/', function (req, res) {
	console.log("request");
	if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === config.FB_VERIFY_TOKEN) {
		res.status(200).send(req.query['hub.challenge']);
	} else {
		console.error("Failed validation. Make sure the validation tokens match.");
		res.sendStatus(403);
	}
})


// Spin up the server
app.listen(app.get('port'), function() {
    console.log('running on port', app.get('port'))
})

app.post('/webhook/', function (req, res) {
	var data = req.body;
	console.log(JSON.stringify(data));



	// Make sure this is a page subscription
	if (data.object == 'page') {
		// Iterate over each entry
		// There may be multiple if batched
		data.entry.forEach(function (pageEntry) {
			var pageID = pageEntry.id;
			var timeOfEvent = pageEntry.time;

			// Iterate over each messaging event
			pageEntry.messaging.forEach(function (messagingEvent) {
				if (messagingEvent.optin) {
					receivedAuthentication(messagingEvent);
				} else if (messagingEvent.message) {
					receivedMessage(messagingEvent);
				} else if (messagingEvent.delivery) {
					receivedDeliveryConfirmation(messagingEvent);
				} else if (messagingEvent.postback) {
					receivedPostback(messagingEvent);
				} else if (messagingEvent.read) {
					receivedMessageRead(messagingEvent);
				} else if (messagingEvent.account_linking) {
					receivedAccountLink(messagingEvent);
				} else {
					console.log("Webhook received unknown messagingEvent: ", messagingEvent);
				}
			});
		});

		// Assume all went well.
		// You must send back a 200, within 20 seconds
		res.sendStatus(200);
	}
});


function verifyRequestSignature(req, res, buf) {
	var signature = req.headers["x-hub-signature"];

	if (!signature) {
		throw new Error('Couldn\'t validate the signature.');
	} else {
		var elements = signature.split('=');
		var method = elements[0];
		var signatureHash = elements[1];

		var expectedHash = crypto.createHmac('sha1',config.FB_APP_SECRET)
			.update(buf)
			.digest('hex');

		if (signatureHash != expectedHash) {
			throw new Error("Couldn't validate the request signature.");
		}
	}
}

function setSessionAndUser(senderID){
    if (!sessionIds.has(senderID)) {
		sessionIds.set(senderID, uuid.v1());
    }
    if (!userMap.has(senderID)){
        userData(function(user){
            userMap.set(senderID,user);

    },senderID);
}
}

function receivedMessage(event) {

	var senderID = event.sender.id;
	var recipientID = event.recipient.id;
	var timeOfMessage = event.timestamp;
	var message = event.message;

	setSessionAndUser(senderID);
	//console.log("Received message for user %d and page %d at %d with message:", senderID, recipientID, timeOfMessage);
	//console.log(JSON.stringify(message));

	var isEcho = message.is_echo;
	var messageId = message.mid;
	var appId = message.app_id;
	var metadata = message.metadata;

	// You may get a text or attachment but not both
	var messageText = message.text;
	var messageAttachments = message.attachments;
	var quickReply = message.quick_reply;

	if (isEcho) {
		handleEcho(messageId, appId, metadata);
		return;
	} else if (quickReply) {
		handleQuickReply(senderID, quickReply, messageId);
		return;
	}


	if (messageText) {
        console.log("message: "+messageText)
        console.log("good morning equality : "+(messageText=="good morning") )
        console.log("equality : "+(messageText=="hi"))
        if (messageText=="hi"||messageText=="hello"||messageText=="hey"||messageText=="Restart bot"||
            messageText=="Hi"||messageText=="Hey"||messageText=="Hello"||messageText=="Get Started"||
            messageText=="مساء الخير"||messageText=="صباح الخير"||messageText=="اهلا"||messageText=="مرحبا"){
            
            greetingText(senderID);
            //greetingwithQuickReply(senderID);
            return;
        }
        else if(messageText=="help"||messageText=="Help"||messageText=="معلومات"||
        messageText=="مساعده"||messageText=="مساعدة"||messageText=="ماهو امام"||
        messageText=="what is imam"){
            helpUserText(senderID);
            return;
        }
        else if(messageText=="ما هو الحديث النبوى الشريف ؟"|messageText=="ما هو الحديث النبوى"){
            whatIsHadith(senderID);
            return;
        }
        else {
            unknownUserText(senderID); 
        }
    
    }

}

// function greetUserText(userId) {
// 	let user=userMap.get(userId);
//     sendTextMessage(userId, "welcome " + user.first_name + '!');
function greetingwithQuickReply(sender) {
    var messageData = {
        recipient: {
			id: recipientId},
            message: { 
                "attachment": {
                "type": "template",
                "payload": {
                    "template_type": "button",
                    "text":"Hi, Tell me more about your self.. you are?",
                    "buttons":[
                                    {
                                    "type":"postback",
                                    "title":"Muslim",
                                    "payload":"Muslim"
                                    },
                                    {
                                    "type":"postback",
                                    "title":"non Muslim",
                                    "payload":"non Muslim"
                                    }
                              ]
                            }
                        }
                        }
                    };
                    request({
                        uri: 'https://graph.facebook.com/v2.6/me/messages',
                        qs: {
                            access_token: config.FB_PAGE_TOKEN
                        },
                        method: 'POST',
                        json: messageData
                
                    }, function (error, response, body) {
                        if (!error && response.statusCode == 200) {
                            var recipientId = body.recipient_id;
                            var messageId = body.message_id;
                
                            if (messageId) {
                                console.log("Successfully sent message with id %s to recipient %s",
                                    messageId, recipientId);
                            } else {
                                console.log("Successfully called Send API for recipient %s",
                                    recipientId);
                            }
                        } else {
                            console.error("Failed calling Send API", response.statusCode, response.statusMessage, body.error);
                        }
                });        
    }

function helpUserText(userId) {
	let user=userMap.get(userId);
    sendTextMessage(userId, "Welcome" + " "+ user.first_name + '!'+ " " + "Imam is your assistant to hep you know al Qouran al karim or al hadith alsharif. /امام هو مساعدك لمعرفة ما هو الحديث الشريف.");
}

function unknownUserText(userId) {
	let user=userMap.get(userId);
    sendTextMessage(userId, "Welcome" + " "+user.first_name + '! ,Sorry i can not understand. Please,Say that again! / اسف لم اتمكن من فهم ذلك، من فضلك كرر ذلك مرة اخرى! ');
}
function whatIsHadith(userId) {
	let user=userMap.get(userId);
    sendTextMessage(userId, "الحديث النبوي الشريف هو كل ما قاله النبي محمد -صلى الله عليه وسلم-، أي كل ما ورد عنه من قول أو فعل أو تقرير أو صفة خلقية أو صفة خلقية أو سيرة وردت عنه، سواء كانت قبل البعثة أم بعدها، وقد حُفِظَ الرسول محمد -صلى الله عليه وسلم- من قبل الله عز وجل منذ ولادته وحتى وفاته، فجميع أقوال النبي الكريم وأفعاله وصفاته الخلقية كما خلقها الله سبحانه وتعالى فيه، والصفات الخلقية نابعة من صفاته التي تحلى بها كالصدق والأمانة، والتي يجب أن يقتدي جميع المسلمين به ويتحلون بصفاته.");
    sendTextMessage(userId,"the record of the words, actions, and the silent approval, of the Islamic prophet Muhammad. Within Islam the authority of Ḥadīth as a source for religious law and moral guidance ranks second only to that of the Qur'an (which Muslims hold to be the word of Allah revealed to his messenger Muhammad).")
}

function greetingText(userId) {
    let user=userMap.get(userId);
    sendTextMessage(userId, "Welcome" + " "+user.first_name + '! ,I am here to help you know al hadith alsharif./ انا هنا لأساعدك على معرفة ماهو الحديث الشريف.');
}
    


function sendTextMessage(recipientId, text) {
	var messageData = {
		recipient: {
			id: recipientId
		},
		message: {
			text: text
		}
	}
	callSendAPI(messageData);
}

function sendQuickReply(recipientId, text, replies, metadata) {
	var messageData = {
		recipient: {
			id: recipientId
		},
		message: {
			text: text,
			metadata: isDefined(metadata)?metadata:'',
			quick_replies: replies
		}
	};

	callSendAPI(messageData);
}


function callSendAPI(messageData) {
	request({
		uri: 'https://graph.facebook.com/v2.6/me/messages',
		qs: {
			access_token: config.FB_PAGE_TOKEN
		},
		method: 'POST',
		json: messageData

	}, function (error, response, body) {
		if (!error && response.statusCode == 200) {
			var recipientId = body.recipient_id;
			var messageId = body.message_id;

			if (messageId) {
				console.log("Successfully sent message with id %s to recipient %s",
					messageId, recipientId);
			} else {
				console.log("Successfully called Send API for recipient %s",
					recipientId);
			}
		} else {
			console.error("Failed calling Send API", response.statusCode, response.statusMessage, body.error);
		}
});
}



function handleEcho(messageId, appId, metadata) {
	// Just logging message echoes to console
	console.log("Received echo for message %s and app %d with metadata %s", messageId, appId, metadata);
}
function handleMessage(message, sender) {
	switch (message.type) {
		case 0: //text
			sendTextMessage(sender, message.speech);
			break;
		case 2: //quick replies
			let replies = [];
			for (var b = 0; b < message.replies.length; b++) {
				let reply =
				{
					"content_type": "text",
					"title": message.replies[b],
					"payload": message.replies[b]
				}
				replies.push(reply);
			}
			sendQuickReply(sender, message.title, replies);
			break;
		case 3: //image
			sendImageMessage(sender, message.imageUrl);
			break;
		case 4:
			// custom payload
			var messageData = {
				recipient: {
					id: sender
				},
				message: message.payload.facebook

			};

			callSendAPI(messageData);

			break;
	}
}

//old & good post 
/*
app.post('/webhook/', function (req, res) {
    let messaging_events = req.body.entry[0].messaging
    for (let i = 0; i < messaging_events.length; i++) {
      let event = req.body.entry[0].messaging[i]
      let sender = event.sender.id
      console.log("before event***************",event.message,"///////////")
      if (event.message && event.message.text) {
        let text = event.message.text
        console.log("befor if",text")
        if (text === 'hi') {
            console.log("in text if//////////////////*")

            greatingWithUserName(sender)
            //crawling(sender)
            //sendQuickReply(sender)
            continue
        }
        sendTextMessage(sender, "Message received: " + text.substring(0, 200))
      }
        if (event.postback) {
            console.log("//////////////////////in postback condition///////////////////////")
            let payload = event.postback.payload
            if(payload=="Muslim"){
                sendQuickReplyToMuslim(sender)
                if (event.postback) {
                    let payload2 = event.postback.payload
                    if(payload=="hadith"){
                        sendTextMessage(sender,"what is your hadith",token)}
                    else if (payload=="quraan"){
                        sendTextMessage(sender,"what is your hadith",token)}
                    else if (payload=="pray"){
                        sendTextMessage(sender,"what is your hadith",token)}

                    }
            
            }  
            
            else if(payload=="non Muslim"){
                sendGenericMessage(sender)
                //sendTextMessage(sender,"Do you want to know about ISLAM",token)}
    
      }
    }
}

    res.sendStatus(200)
  })

*/
//crawling film name
/*
function crawling(sender){

    var url="http://www.imdb.com/title/tt3405236/";
    console.log("in functio/////////////////////////////")
    request(url,function(error,response,html){
        console.log("/*****************in request")
      if (!error && response.statusCode==200)
      {console.log("//////////////in if////////////////////")

          var $=cheerio.load(html);
          var res;
          var json={res:""};

         $('.title_wrapper').filter(function(){
              var data=$(this);
              res=data.children().first().first().text();
              console.log("****************befor json******************")
              //res=data.children().first().children().first().last().text();
              json.res=res;

              }
            )
            console.log("**************after json********************")
            console.log("////////////",res,"///////////////")
       }
        else{
        console.log("///////////////error/////////////////")
    }
}

)

}



//uncpmpelete sector 
function sendToBC( text) {
    
    request({
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {access_token:token},
        method: 'POST',
        json: {
            recipient: {id:sender},
            message:messageData,
        }
    }, function(error, response, body) {
        if (error) {
            console.log('Error sending messages: ', error)
        } else if (response.body.error) {
            console.log('Error: ', response.body.error)
        }
    })

}



function weatherApi(sender,text) {
    console.log("*****************in function***************")
    request({
        url: 'http://api.openweathermap.org/data/2.5/weather',
        qs: {appid:"3f91ef0224e3ca0eea17829c552a1b64",
        q:text,
        }
    }, function (error,response,body) {
        console.log("*****************in request***************")
        if (!error){
                console.log("*****************not error***************")
                let output=JSON.parse(body);
                console.log(output)
                if(output.hasOwnProperty("weather")){
                    console.log("*****************have weather***************")
                    let reply=`${output["weather"][0]["description"]}`;
                    sendTextMessage(sender,reply);
                }else{
                    console.log("*****************don't have weather***************")
                    sendTextMessage(sender,"no weather available for this city");
                   
                }
        
            }
    })

}

//city=cairo&country=egypt&method=2&month=04&year=1437

function prayinTimesApi(sender,text) {
    console.log("*****************in function***************")
    request({
        url: 'http://api.aladhan.com/v1/hijriCalendarByCity',
        qs: {city:text,
        country:"egypt",
        method:"2",
        month:"04",
        year:"1437"
        }
    }, function (error,response,body) {
        console.log("*****************in request***************")
        if (!error){
                console.log("*****************not error***************")
                let output=JSON.parse(body);
                console.log(output)
                if(output.hasOwnProperty("data")){
                    console.log("*****************have weather***************")
                    let reply=`${output["data"][0]["timings"]["Fajr"]}`;
                    sendTextMessage(sender,reply);
                }else{
                    console.log("*****************don't have weather***************")
                    sendTextMessage(sender,"no weather available for this city");
                   
                }
        
            }
    })

}


function keywordExtractor(sender,text) {
    console.log("///////////////in function////////////")
    console.log("&&&&&&&&&&&afer var&&&&&&&&&&&&&&&&&&&&")
    var extraction_result = keyword_extractor.extract(text,{
        language:"english",
        remove_digits: true,
        return_changed_case:true,
        remove_duplicates: true
    });
    console.log(text)
    console.log(keyword_extractor)
    console.log("000000000000000000000000000end and before sending result0000000000000000000000000000")
    sendTextMessage(sender,`your KeyWords are: ${extraction_result}`);

    request.post(
        'http://localhost:3000/api/Sentence',
        { json: { key: 'value' } },
        function (error, response, body) {
            console.log("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
            console.log(error)
            if (!error && response.statusCode == 200) {
                console.log(body)
            }
        }
    );


}


*/


/*
function sendQuickReply(sender) {
    let messageData = {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "button",
                "text":"Hi, Tell me more about your self.. you are?",
                "buttons":[
                                {
                                "type":"postback",
                                "title":"Muslim",
                                "payload":"Muslim"
                                },
                                {
                                "type":"postback",
                                "title":"non Muslim",
                                "payload":"non Muslim"
                                }
                          ]
                        }
                    }
                    }
    request({
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {access_token:token},
        method: 'POST',
        json: {
            recipient: {id:sender},
            message: messageData,
        }
    }, function(error, response, body) {
        if (error) {
            console.log('Error sending messages: ', error)
        } else if (response.body.error) {
            console.log('Error: ', response.body.error)
        }
    })
}
*/




/*
function sendQuickReplyToMuslim(sender) {
    let messageData = {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "button",
                "text":"Great! How can i help you?",
                "buttons":[
                                {
                                "type":"postback",
                                "title":"Hadith Authinticity",
                                "payload":"hadith"
                                },
                                {
                                "type":"postback",
                                "title":"Quraan Tafseer",
                                "payload":"quraan"
                                },
                                {
                                "type":"postback",
                                "title":"Praings timing",
                                "payload":"pray"
                                }
                        ]
                        }
                    }
                    }
    request({
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {access_token:token},
        method: 'POST',
        json: {
            recipient: {id:sender},
            message: messageData,
        }
    }, function(error, response, body) {
        if (error) {
            console.log('Error sending messages: ', error)
        } else if (response.body.error) {
            console.log('Error: ', response.body.error)
        }
    })
}


/*
function sendGenericMessagetToNonNuslim(sender) {
    let messageData = {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "generic",
                "elements": [{
                    "title": "Do you want to know what is Islam",
                    "subtitle": "",
                    "image_url": "https://i.ytimg.com/vi/hezcb2YRasM/maxresdefault.jpg",
                    "buttons": [{
                        "type": "web_url",
                        "url": "https://en.wikipedia.org/wiki/Islam",
                        "title": "The Islamic Relegion"
                    }]
                }
                ]
            }
        }
    }
    request({
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {access_token:token},
        method: 'POST',
        json: {
            recipient: {id:sender},
            message: messageData,
        }
    }, function(error, response, body) {
        if (error) {
            console.log('Error sending messages: ', error)
        } else if (response.body.error) {
            console.log('Error: ', response.body.error)
        }
    })
}
*/
