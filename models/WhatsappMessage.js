const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema({
  message_id: { type: String },
  message_text_body: { type: String },
  message_type: { type: String },
  timestamp: { type: String },
  button_id: { type: String },
  button_title: { type: String },
}, { _id: false }); // Disabling _id for subdocuments to avoid duplication of IDs

const WhatsappMessageSchema = new mongoose.Schema({
  messaging_product: { type: String, required: true },
  display_phone_number: { type: String, required: true },
  phone_number_id: { type: String, required: true },
  contact_name: { type: String },
  contact_wa_id: { type: String },
  recipient_id: { type: String },
  conversation_id: { type: String },
  messages: [MessageSchema] // Array to store all messages exchanged with the user
}, { timestamps: true });

const WhatsappMessage = mongoose.model("WhatsappMessage", WhatsappMessageSchema);

module.exports = WhatsappMessage;
