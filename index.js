const express = require("express");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
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
    const cartCollection = client.db("MealCollectionDB").collection("carts");
    const paymentsCollection = client
      .db("MealCollectionDB")
      .collection("payments");

    // JWT related API
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ message: "Email is required." });
      }
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

    app.get("/user/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

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

    app.get("/allMeals", async (req, res) => {
      try {
        const sort = req.query.sort || "";
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const distributor = req.query.distributor || "";

        // Build filters and options
        let filter = {};
        if (distributor) filter.distributorName = distributor;

        let options = {};
        if (sort) options.sort = { likes: sort === "asc" ? 1 : -1 };

        // Pagination
        const skip = (page - 1) * limit;
        const result = await mealsCollection
          .find(filter, options)
          .skip(skip)
          .limit(limit)
          .toArray();

        // Total count for pagination
        const total = await mealsCollection.countDocuments(filter);

        res.send({
          meals: result,
          total,
          currentPage: page,
          totalPages: Math.ceil(total / limit),
        });
      } catch (error) {
        console.error("Error fetching meals:", error.message);
        res
          .status(500)
          .send({ message: "Failed to fetch meals", error: error.message });
      }
    });

    //get single meal
    app.get("/meals/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await mealsCollection.findOne(query);
      res.send(result);
    });
    app.post("/meal", verifyToken, verifyAdmin, async (req, res) => {
      const newMeal = req.body;
      const result = await mealsCollection.insertOne(newMeal);
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
      const { likes, likedBy } = req.body;
      const filter = { _id: new ObjectId(id) };
      const meal = await mealsCollection.findOne(filter);
      if (meal?.likedBy?.includes(likedBy)) {
        return res
          .status(400)
          .send({ error: "You have already liked this meal." });
      }
      const update = {
        $inc: { likes: 1 },
        $addToSet: { likedBy },
      };
      const result = await mealsCollection.updateOne(filter, update);
      res.send(result);
    });

    // get All upcoming meals

    //this api for client side
    app.get("/upcoming", async (req, res) => {
      const result = await upcomingMealsCollection.find().toArray();
      res.send(result);
    });


    app.get("/upcomingMeals", verifyToken, async (req, res) => {
      try {
        const sort = req.query.sort || "";
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const distributor = req.query.distributor || "";

        // Build filters and options
        let filter = {};
        if (distributor) filter.distributorName = distributor;

        let options = {};
        if (sort) options.sort = { likes: sort === "asc" ? 1 : -1 };

        // Pagination
        const skip = (page - 1) * limit;
        const result = await upcomingMealsCollection
          .find(filter, options)
          .skip(skip)
          .limit(limit)
          .toArray();
        // Total count for pagination
        const total = await upcomingMealsCollection.countDocuments(filter);
        res.send({
          meals: result,
          total,
          currentPage: page,
          totalPages: Math.ceil(total / limit),
        });
      } catch (error) {
        console.error("Error fetching meals:", error.message);
        res
          .status(500)
          .send({ message: "Failed to fetch meals", error: error.message });
      }
    });

    app.post("/upcomingMeals", verifyToken, async (req, res) => {
      const newMeal = req.body;
      const result = await upcomingMealsCollection.insertOne(newMeal);
      res.send(result);
    });

    app.delete("/upcomingMeals/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await upcomingMealsCollection.deleteOne(query);
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
    app.get("/requestMeal", verifyToken, verifyAdmin, async (req, res) => {
      const search = req.query.search || "";
      let query = {
        $or: [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ],
      };
      const result = await requestMealsCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/requestMeal/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await requestMealsCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/requestMeal/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const data = req.body;
      const result = await requestMealsCollection.insertOne(data);
      res.send(result);
    });

    // Deliver food (request Meal)
    
    app.patch(
      "/requestMeal/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            status: "Delivered ",
          },
        };
        const result = await requestMealsCollection.updateOne(
          filter,
          updatedDoc
        );
        res.send(result);
      }
    );

    //Review related API
    app.get("/reviews/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { reviewerEmail: email };
      const result = await reviewCollection.find(query).toArray();
      res.send(result);
    });
    app.get("/reviews", verifyToken, async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.send(result);
    });

    app.post("/reviews", verifyToken, async (req, res) => {
      const review = req.body;
      const result = await reviewCollection.insertOne(review);
    });

    /**
     * ***************************************************************
     *  Carts Collection
     * ***************************************************************
     * */

    app.get("/carts/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    });
    app.post("/carts", async (req, res) => {
      const cartItem = req.body;
      const result = await cartCollection.insertOne(cartItem);
      res.send(result);
    });
    app.delete("/carts/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    });

    /**
     * ***************************************************************
     *  Payment
     * ***************************************************************
     * */

    // Payment intent
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      // console.log(paymentIntent, "from paymentIntent");
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.get("/payments/:email", verifyToken, async (req, res) => {
      const { email, ...data } = req.body;
      const email1 = req.params.email;
      const query = { email: email1 };
      const result = await paymentsCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/payments", async (req, res) => {
      const { email, price, ...payment } = req.body;
      const payments = req.body;
      const paymentResult = await paymentsCollection.insertOne(payments);

      const query = { email: email };

      // return console.log({ query, payments });

      const deleteCart = await cartCollection.deleteMany(query);

      let badge = "";
      if (price === 100) {
        badge = "Silver";
      } else if (price === 150) {
        badge = "Gold";
      } else {
        badge = "Platinum";
      }

      const updateBadge = await usersCollection.updateOne(query, {
        $set: { badge: badge },
      });

      res.send({ paymentResult, deleteCart, updateBadge });
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
