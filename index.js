const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const port = process.env.PORT || 5000;
const app = express();

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.dssil.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const mealsCollection = client.db("MealCollectionDB").collection("Meals");

    app.get("/meals", async (req, res) => {
      const filter = req.query.filter;
      const search = req.query.search || "";
      const sort = req.query.sort;
      let options = {};
      if (sort) options = { sort: { price: sort === "asc" ? 1 : -1 } };

      let query = {
        title: {
          $regex: search,
          $options: "i",
        },
      };

      if (filter) query.category = filter;

      const result = await mealsCollection.find(query, options).toArray();
      res.send(result);
    });

    //get single meal
    app.get("/meals/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await mealsCollection.findOne(query);
      res.send(result);
    });

    // Insert a review
    app.post("/meals/:id", async (req, res) => {
      const id = req.params.id;
      const newReview = req.body;
      const filter = { _id: new ObjectId(id) };
      const updatedData = {
        $push: { reviews: newReview }, // Use $push to append the new review
      };
      const result = await mealsCollection.updateOne(filter, updatedData);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);
app.get("/", (req, res) => {
  res.send("Hello From Hostel management Server....");
});

app.listen(port, () => console.log(`Server running on port ${port}`));
