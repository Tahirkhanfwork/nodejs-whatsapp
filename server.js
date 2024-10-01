const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const http = require('http');
const ngrok = require('@ngrok/ngrok');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse incoming JSON
app.use(bodyParser.json());

// WhatsApp credentials
const WHATSAPP_API_URL = 'https://graph.facebook.com/v17.0/416150228248059';
const ACCESS_TOKEN = 'EAAHCYkVjaesBOxuduuEz7ZCVcgZBFAhE0jChpDvZC8UZAfMeZC12Scx41u66WHNTSGCiHLsP1ycnEUG9gBxoNgNmSo45qgjZAqL4gdDjIgvUSKMfCxPE8vwR837eniLti3BwpDWyXLv8N0ZCxE9Nk8P399klQ6ruzphHbZBGq9de7gNcA98NsAtE8qfHtWnZACWXAsZAjHrup59fiMGtjF7JYQWZAYk27xDoB05NMcTNKUMGkMZD';

// Endpoint for verifying the webhook (Facebook will send a request to this URL to verify)
app.get('/webhook', (req, res) => {
    let mode = req.query['hub.mode'];
    let token = req.query['hub.verify_token'];
    let challenge = req.query['hub.challenge'];

    if (mode && token === 'fudugo') {
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

// Handle incoming WhatsApp messages
app.post('/webhook', (req, res) => {
    let body = req.body;

    // Check if the incoming request is a message event
    if (body.object === 'whatsapp_business_account') {
        body.entry.forEach(entry => {
            entry.changes.forEach(change => {
                if (change.value.messages) {
                    let message = change.value.messages[0];
                    let senderNumber = message.from;
                    let messageBody = message.text.body;

                    console.log('Received message:', messageBody, 'from', senderNumber);

                    // Respond to the user based on the message text
                    handleIncomingMessage(senderNumber, messageBody);
                }
            });
        });
        res.sendStatus(200);
    } else {
        res.sendStatus(404);
    }
});

// Function to handle incoming messages and send responses
function handleIncomingMessage(sender, messageText) {
    if (messageText === 'Book appointment') {
        sendWhatsAppMessage(sender, 'Please select a time slot:\n1. 10 AM\n2. 2 PM\n3. 4 PM');
    } else {
        sendWhatsAppMessage(sender, 'Hello! How can I assist you today?');
    }
}

// Function to send a message via WhatsApp API
function sendWhatsAppMessage(recipient, messageText) {
    const data = {
        messaging_product: 'whatsapp',
        to: recipient,
        text: { body: messageText }
    };

    axios.post(`${WHATSAPP_API_URL}/messages`, data, {
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}` }
    })
    .then(response => {
        console.log('Message sent:', response.data);
    })
    .catch(error => {
        console.error('Error sending message:', error.response ? error.response.data : error.message);
    });
}

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
