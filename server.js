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

app.post("/webhook", async (req, res) => {
  logMessages.push(req.body);

  const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  const contact = req.body.entry?.[0]?.changes?.[0]?.value?.contacts?.[0];
  const metadata = req.body.entry?.[0]?.changes?.[0]?.value?.metadata;
  const messaging_product = req.body.entry?.[0]?.changes?.[0]?.value?.messaging_product;
  const conversation_id = req.body.entry?.[0]?.changes?.[0]?.statuses?.[0].conversation?.id;

  const newMessage = {
    message_id: message?.id,
    message_text_body: message?.text?.body || null,
    message_type: message?.type,
    timestamp: message?.timestamp,
  };

  try {
    const existingConversation = await WhatsappMessage.findOne({
      conversation_id: conversation_id,
    });

    if (existingConversation) {
      existingConversation.messages.push(newMessage);
      await existingConversation.save();
    } else {
      const newEntry = new WhatsappMessage({
        messaging_product: messaging_product,
        display_phone_number: metadata?.display_phone_number,
        phone_number_id: metadata?.phone_number_id,
        contact_name: contact?.profile?.name,
        contact_wa_id: contact?.wa_id,
        recipient_id: message?.from,
        conversation_id: conversation_id,
        messages: [newMessage],
      });
      await newEntry.save();
    }
  } catch (error) {
    console.error("Error saving message to MongoDB:", error);
  }

  if (message?.type === "text" && newMessage.message_text_body=="Hello I want to book an appointment") {
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
              text: "Are you a new patient?",
            },
            action: {
              buttons: [
                { type: "reply", reply: { id: "new_patient_yes", title: "Yes" } },
                { type: "reply", reply: { id: "new_patient_no", title: "No" } },
              ]
            },
          },
        },
      });

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
      const existingUser    = await WhatsappMessage.findOne({
        contact_wa_id: contact?.wa_id
      });

      if (existingUser   ) {
        existingUser   .messages.push({
          message_id: message.id,
          button_id: buttonId,
          button_title: buttonTitle,
          message_type: "button_reply",
        });
        await existingUser.save();

        if (buttonId === "new_patient_yes") {
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
              interactive : {
                type: "button",
                body: {
                  text: "Please select a treatment:",
                },
                action: {
                  buttons: [
                    { type : "reply", reply: { id: "implant", title: "Implant" } },
                    { type: "reply", reply: { id: "rct", title: "RCT" } },
                    { type: "reply", reply: { id: "sedation", title: "Sedation" } },
                  ]
                },
              },
            },
          });
        } else if (buttonId === "new_patient_no") {
          await sendWhatsAppMessage(message.from, "Please enter your name and email to proceed as a new patient.");
        } else if (buttonId === "implant") {
          await sendWhatsAppMessage(message.from, "When would you like to schedule an appointment for Implant treatment?");
        } else if (buttonId === "rct") {
          await sendWhatsAppMessage(message.from, "When would you like to schedule an appointment for RCT treatment?");
        } else if (buttonId === "sedation") {
          await sendWhatsAppMessage(message.from, "When would you like to schedule an appointment for Sedation treatment?");
        } else if (buttonId === "confirm_appointment") {
        await sendWhatsAppMessage(message.from, "Thank you for confirming your appointment!");
      } else if (buttonId === "cancel_appointment") {
        await sendWhatsAppMessage(message.from, "Thank you for cancelling your appointment!");
      }
        
      }
    } catch (error) {
      console.error("Error saving button click:", error);
    }
  } else if (message?.type === "text") {
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
              text: "Please confirm your appointment",
            },
            action: {
              buttons: [
                { type: "reply", reply: { id: "confirm_appointment", title: "Yes confirm" } },
                { type: "reply", reply: { id: "cancel_appointment", title: "No cancel it" } },
              ]
            },
          },
        },
      });
    } catch (error) {
      console.error("Error sending confirmation message:", error);
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
  } else {
    res.sendStatus(403);
  }
});

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
  } catch (error) {
    console.error('Error sending message:', error.response ? error.response.data : error.message);
  }
}

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
