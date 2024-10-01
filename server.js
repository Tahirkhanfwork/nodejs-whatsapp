const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");
const db = require("./config/db");
const WhatsappMessage = require("./models/WhatsappMessage");

db()
  .then(() => console.log("Database connected successfully"))
  .catch((err) => console.log("Database connection error:", err));

dotenv.config();
const app = express();
app.use(express.json());

const { WEBHOOK_VERIFY_TOKEN, GRAPH_API_TOKEN, PORT } = process.env;
const logMessages = [];

app.post("/webhook", async (req, res) => {
  logMessages.push(req.body);

  const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  const status = req.body.entry?.[0]?.changes?.[0]?.value?.statuses?.[0];
  const contact = req.body.entry?.[0]?.changes?.[0]?.value?.contacts?.[0];
  const metadata = req.body.entry?.[0]?.changes?.[0]?.value?.metadata;

  const data = {
    messaging_product:
      req.body.entry?.[0]?.changes?.[0]?.value?.messaging_product,
    display_phone_number: metadata?.display_phone_number,
    phone_number_id: metadata?.phone_number_id,
    status: status?.status,
    timestamp: status?.timestamp || message?.timestamp,
    recipient_id: status?.recipient_id,
    conversation_id: status?.conversation?.id,
    conversation_expiration_timestamp:
      status?.conversation?.expiration_timestamp,
    conversation_origin_type: status?.conversation?.origin?.type,
    pricing_billable: status?.pricing?.billable,
    pricing_model: status?.pricing?.pricing_model,
    pricing_category: status?.pricing?.category,
    contact_name: contact?.profile?.name,
    contact_wa_id: contact?.wa_id,
    message_from: message?.from,
    message_id: message?.id,
    message_text_body: message?.text?.body,
    message_type: message?.type,
  };

  try {
    await WhatsappMessage.findOneAndUpdate(
      { conversation_id: data.conversation_id },
      data,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    console.error("Error saving message to MongoDB:", error);
  }

  if (message?.type === "text") {
    const business_phone_number_id = metadata?.phone_number_id;

    try {
      await axios({
        method: "POST",
        url: `https://graph.facebook.com/v18.0/421883474342343/messages`,
        headers: {
          Authorization: `Bearer ${GRAPH_API_TOKEN}`,
        },
        data: {
          messaging_product: "whatsapp",
          to: message.from,
          text: { body: "Echo: " + message.text.body },
          context: {
            message_id: message.id,
          },
        },
      });

      await axios({
        method: "POST",
        url: `https://graph.facebook.com/v18.0/421883474342343/messages`,
        headers: {
          Authorization: `Bearer ${GRAPH_API_TOKEN}`,
        },
        data: {
          messaging_product: "whatsapp",
          status: "read",
          message_id: message.id,
        },
      });
    } catch (error) {
      console.error("Error sending reply or marking as read:", error);
    }
  }

  res.sendStatus(200);
});

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === WEBHOOK_VERIFY_TOKEN) {
    res.status(200).send(challenge);
    console.log("Webhook verified successfully!");
  } else if (
    mode === undefined &&
    token === undefined &&
    challenge === undefined
  ) {
    res.status(200).json({ logMessages });
  } else {
    res.sendStatus(403);
  }
});

app.get("/", (req, res) => {
  res.send(`<pre>Nothing to see here.
Checkout README.md to start.</pre>`);
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
