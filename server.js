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

const { WEBHOOK_VERIFY_TOKEN, GRAPH_API_TOKEN, PORT, WHATSAPP_API_URL, phone_number_id } = process.env;
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
                {
                  type: "reply",
                  reply: {
                    id: "make_payment",
                    title: "Pay Now",
                  },
                },
                {
                  type: "reply",
                  reply: {
                    id: "other_enquiry",
                    title: "Enquiry",
                  },
                },
                {
                  type: "reply",
                  reply: {
                    id: "new_patient",
                    title: "New Patient",
                  },
                },
              ],
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

    if (buttonId === "make_payment") {
      await sendWhatsAppMessage(message.from, "Please enter your account number to proceed with payment.");
    } else if (buttonId === "other_enquiry") {
      await sendWhatsAppMessage(message.from, "Please contact our customer care at +1 234-567-890 for further assistance.");
    } else if (buttonId === "new_patient") {
      await sendWhatsAppMessage(message.from, "Please enter your name and email to proceed as a new patient.");
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
    messaging_product: 'whatsapp',
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
