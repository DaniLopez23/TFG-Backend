const mongoose = require("mongoose");

const tankSchema = new mongoose.Schema({
  height: {
    type: Number,
    required: true,
  },
  capacity: {
    type: Number,
    required: true,
  },
  sensors: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Sensor",
    },
  ],
});

tankSchema.set("toJSON", {
  transform: (document, returnedObject) => {
    returnedObject.id = returnedObject._id.toString();
    delete returnedObject._id;
    delete returnedObject.__v;
  },
});

module.exports = mongoose.model("Tank", tankSchema);


