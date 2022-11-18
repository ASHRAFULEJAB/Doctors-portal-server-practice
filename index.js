const { MongoClient, ServerApiVersion } = require('mongodb')
const express = require('express')
const cors = require('cors')
require('dotenv').config()

const app = express()
app.use(cors())
app.use(express.json())
const port = process.env.PORT || 5000

app.get('/', (re, res) => {
  res.send('Doctors portal is running')
})
app.listen(port, () => {
  console.log(`doctors portal is running on ${port}`)
})

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.dnw37y6.mongodb.net/?retryWrites=true&w=majority`
console.log(uri)
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
})

async function run() {
  try {
    const appionmentOptionsCollection = client
      .db('DoctorPortalDB')
      .collection('appionmentOptions')
    const bookingsCollection = client
      .db('DoctorPortalDB')
      .collection('bookings')

    app.get('/appionmentOptions', async (req, res) => {
      const date = req.query.date;
      const query = {}
      const options = await appionmentOptionsCollection.find(query).toArray()
      const bookingQuery = { appionmentDate: date }
      const alreadyBooked = await bookingsCollection.find(bookingQuery).toArray()
      options.forEach(option => {
        const optionBooked = alreadyBooked.filter(booked => booked.treatment === option.name)
        const bookedSlots = optionBooked.map(book => book.slot)
        const remainingSlots = option.slots.filter(slot => !bookedSlots.includes(slot))
        option.slots=remainingSlots
      })
      res.send(options)
    })
    app.post('/bookings', async (req, res) => {
      const booking = req.body
      const query = {
        appionmentDate: booking.appionmentDate,
        email: booking.email,
        treatment:booking.treatment

      }
      const alreadyBooked = await bookingsCollection.find(query).toArray()
      if (alreadyBooked.length) {
        const message = `You have already booked on${booking.appionmentDate}`
         return res.send({acknowledged:false,message})
      }
      const result = await bookingsCollection.insertOne(booking)
      res.send(result)
    })
  } finally {
  }
}
run().catch(console.dir)
