const express = require("express");
const jwt = require("jsonwebtoken");
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
    const usersCollection = client.db("MealCollectionDB").collection("Users");
    const mealsCollection = client.db("MealCollectionDB").collection("Meals");
    const requestMealsCollection = client
      .db("MealCollectionDB")
      .collection("requestMeals");
    const upcomingMealsCollection = client
      .db("MealCollectionDB")
      .collection("upcomingMeals");
    const reviewCollection = client
      .db("MealCollectionDB")
      .collection("reviews");

    // JWT related API
    app.post("/jwt", async (req, res) => {
      //payload
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "5h",
      });
      res.send({ token });
    });

    // middlewares
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized Access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: " unauthorized Access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    //use verify admin after verify token
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "Forbidden access" });
      }
      next();
    };

    // User related API
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const search = req.query.search || "";
      let query = {
        $or: [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ],
      };
      const result = await usersCollection.find(query).toArray();
      res.send(result);
    });

    //Admin APi
    app.get(
      "/users/admin/:email",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const email = req.params.email;
        if (email !== req.decoded.email) {
          return res.status(403).send({ message: "Forbidden access" });
        }
        const query = { email: email };
        const user = await usersCollection.findOne(query);
        let admin = false;
        if (user) {
          admin = user.role === "admin";
        }
        res.send({ admin });
      }
    );

    app.post("/users", async (req, res) => {
      const user = req.body;
      // insert email if user doesn't exists:
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exists", insertedId: null });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.get("/user/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });

    app.patch(
      "/users/admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            role: "admin",
          },
        };
        const result = await usersCollection.updateOne(filter, updatedDoc);
        res.send(result);
      }
    );

    //get all published meals
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
    app.post("/meals/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const newReview = req.body;
      const filter = { _id: new ObjectId(id) };
      const updatedData = {
        $push: { reviews: newReview },
      };
      const result = await mealsCollection.updateOne(filter, updatedData);
      res.send(result);
    });

    // Increase like count in single meal data
    app.patch("/meals/:id", verifyToken, async (req, res) => {
      const id = req.params.id;

      const filter = { _id: new ObjectId(id) };
      const update = {
        $inc: { likes: 1 },
      };
      const result = await mealsCollection.updateOne(filter, update);
      res.send(result);
    });

    // get All upcoming meals
    app.get("/upcomingMeals", async (req, res) => {
      const result = await upcomingMealsCollection.find().toArray();
      res.send(result);
    });

    // Increase like count in single upcomingMeal data
    app.patch("/upcomingMeals/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const { likes, likedBy } = req.body;
      const filter = { _id: new ObjectId(id) };

      const meal = await upcomingMealsCollection.findOne(filter);
      if (meal?.likedBy?.includes(likedBy)) {
        return res
          .status(400)
          .send({ error: "You have already liked this meal." });
      }
      const update = {
        $inc: { likes: 1 },
        $addToSet: { likedBy },
      };
      const result = await upcomingMealsCollection.updateOne(filter, update);
      res.send(result);
    });

    // request Meal API
    app.get("/requestMeal/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await requestMealsCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/requestMeal/:id", async (req, res) => {
      const id = req.params.id;
      const data = req.body;
      const result = await requestMealsCollection.insertOne(data);
      res.send(result);
    });

    //Review related API
    app.get("/reviews/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { reviewerEmail: email };
      const result = await reviewCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/reviews", verifyToken, async (req, res) => {
      const review = req.body;
      const result = await reviewCollection.insertOne(review);
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
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
