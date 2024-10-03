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

const { WEBHOOK_VERIFY_TOKEN, GRAPH_API_TOKEN, PORT, phone_number_id } = process.env;
const logMessages = [];

// Webhook to handle incoming messages
app.post("/webhook", async (req, res) => {
  logMessages.push(req.body);

  const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  const contact = req.body.entry?.[0]?.changes?.[0]?.value?.contacts?.[0];
  const metadata = req.body.entry?.[0]?.changes?.[0]?.value?.metadata;
  const messaging_product = req.body.entry?.[0]?.changes?.[0]?.value?.messaging_product; // Ensure this is from `value`

  // Extract the necessary data
  const newMessage = {
    message_id: message?.id,
    message_text_body: message?.text?.body || null,
    message_type: message?.type,
    timestamp: message?.timestamp,
  };

  try {
    // Find the user by their WhatsApp ID
    const existingUser = await WhatsappMessage.findOne({
      contact_wa_id: contact?.wa_id
    });

    if (existingUser) {
      // If user exists, append the new message to their message array
      if (message?.from === contact?.wa_id) {
        // Save user message only
        existingUser.messages.push(newMessage);
        await existingUser.save();
        console.log(`Message appended to existing user: ${contact?.wa_id}`);
      }
    } else {
      // If user doesn't exist, create a new entry for the user
      const newEntry = new WhatsappMessage({
        messaging_product: messaging_product,  // Correct messaging product
        display_phone_number: metadata?.display_phone_number,
        phone_number_id: metadata?.phone_number_id,
        contact_name: contact?.profile?.name,
        contact_wa_id: contact?.wa_id,
        recipient_id: message?.from,
        conversation_id: null,
        messages: [newMessage],
      });
      await newEntry.save();
      console.log(`New entry created for user: ${contact?.wa_id}`);
    }
  } catch (error) {
    console.error("Error saving message to MongoDB:", error);
  }

  // If it's a text message, respond with buttons
  if (message?.type === "text") {
    try {
      await axios({
        method: "POST",
        url: `https://graph.facebook.com/v20.0/${phone_number_id}/messages`,
        headers: {
          Authorization: `Bearer ${GRAPH_API_TOKEN}`,
        },
        data: {
          messaging_product: "whatsapp",
          to: message.from,
          type: "interactive",
          interactive: {
            type: "button",
            body: {
              text: "Choose an option:",
            },
            action: {
              buttons: [
                { type: "reply", reply: { id: "make_payment", title: "Pay Now" } },
                { type: "reply", reply: { id: "other_enquiry", title: "Enquiry" } },
                { type: "reply", reply: { id: "new_patient", title: "New Patient" } },
              ]
            },
          },
        },
      });

      // Mark message as read
      await axios({
        method: "POST",
        url: `https://graph.facebook.com/v20.0/${phone_number_id}/messages`,
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
      console.error("Error sending buttons or marking as read:", error);
    }
  } else if (message?.type === "interactive" && message?.interactive?.type === "button_reply") {
    const buttonId = message.interactive.button_reply.id;
    const buttonTitle = message.interactive.button_reply.title;

    try {
      // Append button click info to the user's messages array
      const existingUser = await WhatsappMessage.findOne({
        contact_wa_id: contact?.wa_id
      });

      if (existingUser) {
        existingUser.messages.push({
          message_id: message.id,
          button_id: buttonId,
          button_title: buttonTitle,
          message_type: "button_reply",
        });
        await existingUser.save();
        console.log(`Button reply appended for user: ${contact?.wa_id}`);

        // Send appropriate response based on the button clicked
        if (buttonId === "make_payment") {
          await sendWhatsAppMessage(message.from, "Please enter your account number to proceed with payment.");
        } else if (buttonId === "other_enquiry") {
          await sendWhatsAppMessage(message.from, "Please contact our customer care at +1 234-567-890 for further assistance.");
        } else if (buttonId === "new_patient") {
          await sendWhatsAppMessage(message.from, "Please enter your name and email to proceed as a new patient.");
        }
      }
    } catch (error) {
      console.error("Error saving button click:", error);
    }
  }

  res.sendStatus(200);
});

// Webhook verification
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === WEBHOOK_VERIFY_TOKEN) {
    res.status(200).send(challenge);
    console.log("Webhook verified successfully!");
  } else {
    res.sendStatus(403);
  }
});

// Helper function to send WhatsApp messages
async function sendWhatsAppMessage(recipient, messageText) {
  const data = {
    messaging_product: "whatsapp",
    to: recipient,
    text: { body: messageText },
  };

  try {
    const response = await axios.post(`https://graph.facebook.com/v20.0/${phone_number_id}/messages`, data, {
      headers: { Authorization: `Bearer ${GRAPH_API_TOKEN}` },
    });
    console.log('Message sent:', response.data);
  } catch (error) {
    console.error('Error sending message:', error.response ? error.response.data : error.message);
  }
}

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
