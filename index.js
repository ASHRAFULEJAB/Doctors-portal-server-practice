const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const express = require('express')
const cors = require('cors')
require('dotenv').config()
const jwt = require('jsonwebtoken')
const stripe = require('stripe')(process.env.STRIPE_KEY)

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

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
})

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization
  console.log(req.headers.authorization)
  if (!authHeader) {
    return res.status(401).send('Unauhtorized Access')
  }
  const token = authHeader.split(' ')[1]
  jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
    if (err) {
      return req.status(403).send('Forbidden access')
    }
    req.decoded = decoded
    next()
  })
}

async function run() {
  try {
    const appionmentOptionsCollection = client
      .db('DoctorPortalDB')
      .collection('appionmentOptions')
    const bookingsCollection = client
      .db('DoctorPortalDB')
      .collection('bookings')
    const usersCollection = client.db('DoctorPortalDB').collection('users')
    const doctorsCollection = client.db('DoctorPortalDB').collection('doctors')
    const paymentsCollection = client.db('DoctorPortalDB').collection('payments')

    //admin verify
    const verifyAdmin = async (req, res, next) => {
      const decodedEmail = req.decoded.email
      const query = { email: decodedEmail }
      const user = await usersCollection.findOne(query)
      if (user?.role !== 'admin') {
        return res.status(403).send('forbidden access')
      }
      next()
    }

    app.get('/appionmentOptions', async (req, res) => {
      const date = req.query.date
      const query = {}
      const options = await appionmentOptionsCollection.find(query).toArray()
      const bookingQuery = { appionmentDate: date }
      const alreadyBooked = await bookingsCollection
        .find(bookingQuery)
        .toArray()
      options.forEach((option) => {
        const optionBooked = alreadyBooked.filter(
          (booked) => booked.treatment === option.name
        )
        const bookedSlots = optionBooked.map((book) => book.slot)
        const remainingSlots = option.slots.filter(
          (slot) => !bookedSlots.includes(slot)
        )
        option.slots = remainingSlots
      })
      res.send(options)
    })

    app.get('/appionmentspecialty', async (Req, res) => {
      const query = {}
      const result = await appionmentOptionsCollection
        .find(query)
        .project({ name: 1 })
        .toArray()
      res.send(result)
    })

    app.get('/bookings', verifyJWT, async (req, res) => {
      const email = req.query.email
      const decodedEmail = req.decoded.email
      if (email !== decodedEmail) {
        return req.status(403).send('forbidden access')
      }
      const query = { email: email }
      const result = await bookingsCollection.find(query).toArray()
      res.send(result)
    })

    app.post('/bookings', async (req, res) => {
      const booking = req.body
      const query = {
        appionmentDate: booking.appionmentDate,
        email: booking.email,
        treatment: booking.treatment,
      }
      const alreadyBooked = await bookingsCollection.find(query).toArray()
      if (alreadyBooked.length) {
        const message = `You have already booked on${booking.appionmentDate}`
        return res.send({ acknowledged: false, message })
      }
      const result = await bookingsCollection.insertOne(booking)
      res.send(result)
    })

    app.get('/jwt', async (req, res) => {
      const email = req.query.email
      const query = { email: email }
      const user = await usersCollection.findOne(query)
      console.log(user)
      if (user) {
        const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, {
          expiresIn: '2d',
        })
        return res.send({ accessToken: token })
      }
      res.status(401).send({ accessToken: '' })
    })

    app.post('/users', async (req, res) => {
      const user = req.body
      const result = await usersCollection.insertOne(user)
      res.send(result)
    })

    app.get('/users', async (req, res) => {
      const query = {}
      const result = await usersCollection.find(query).toArray()
      res.send(result)
    })

    app.get('/users/admin/:email', async (req, res) => {
      const email = req.params.email
      const query = { email }
      const user = await usersCollection.findOne(query)
      // console.log(user)
      res.send({ isAdmin: user?.role === 'admin' })
    })

    app.put('/users/admin/:id', verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id
      const filter = { _id: ObjectId(id) }
      const options = { upsert: true }
      const updatedDoc = {
        $set: {
          role: 'admin',
        },
      }
      const result = await usersCollection.updateOne(
        filter,
        updatedDoc,
        options
      )
      res.send(result)
    })
    //temporaray data insert or database update
    // app.get('/addprice', async (req, res) => {
    //   const filter = {}
    //   const options = { upsert: true }
    //   const updatedDoc = {
    //     $set: {
    //       price: 69,
    //     },
    //   }
    //   const result = await appionmentOptionsCollection.updateMany(
    //     filter,
    //     updatedDoc,
    //     options
    //   )
    //   res.send(result)
    // })

    //doctors info
    app.get('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
      const query = {}
      const doctors = await doctorsCollection.find(query).toArray()
      res.send(doctors)
    })

    app.post('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
      const doctor = req.body
      const result = await doctorsCollection.insertOne(doctor)
      res.send(result)
    })
    app.delete('/doctors/:id', verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id
      const filter = { _id: ObjectId(id) }
      const result = await doctorsCollection.deleteOne(filter)
      res.send(result)
    })

    //payment
    app.get('/bookings/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: ObjectId(id) }
      const result = await bookingsCollection.findOne(query)
      res.send(result)
    })

    app.post('/create-payment-intent', async (req, res) => {
      const booking = req.body;
      const price = booking.price;
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        currency: 'usd',
        amount: amount,
        "payment_method_types": [
          "card"
        ],
      })
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    })
    app.post('/payments', async (req, res) => {
      const payment = req.body;
      const result = await paymentsCollection.insertOne(payment)
      const id = payment.bookingId;
      const filter = { _id: ObjectId(id) }
      const updadtedDoc = {
        $set: {
          paid: true,
          transactionId:payment.transactionId
        }
      }
      const updatedResult = await bookingsCollection.updateOne(filter,updadtedDoc)
      res.send(result)
   })

  } finally {
  }
}
run().catch(console.dir)
