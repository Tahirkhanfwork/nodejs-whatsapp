const mongoose = require("mongoose");

const WhatsappMessageSchema = new mongoose.Schema({
  messaging_product: { type: String, required: true },
  display_phone_number: { type: String, required: true },
  phone_number_id: { type: String, required: true },
  status: { type: String },
  timestamp: { type: String },
  recipient_id: { type: String },
  conversation_id: { type: String },
  conversation_expiration_timestamp: { type: String },
  conversation_origin_type: { type: String },
  pricing_billable: { type: Boolean },
  pricing_model: { type: String },
  pricing_category: { type: String },
  contact_name: { type: String },
  contact_wa_id: { type: String },
  message_from: { type: String },
  message_id: { type: String },
  message_text_body: { type: String },
  message_type: { type: String }
}, { timestamps: true });

const WhatsappMessage = mongoose.model("WhatsappMessage", WhatsappMessageSchema);

module.exports = WhatsappMessage;
