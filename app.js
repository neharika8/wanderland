if(process.env.NODE_ENV != 'production'){
    require('dotenv').config();
}

require('dotenv').config();
console.log(process.env.SECRET);

const express = require("express");
const app = express();
const mongoose = require("mongoose");
const Listing = require("./models/listing.js");
const path = require("path");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const expressLayouts = require("express-ejs-layouts");
const Review = require("./models/reviews.js");
const session = require("express-session");
const MongoStore = require('connect-mongo')
const flash = require("connect-flash");
const MONGO_URL ='mongodb://127.0.0.1:27017/wanderlust';
const passport = require("passport");
const LocalStrategy = require("passport-local");
const User = require("./models/user.js");
const userRouter = require("./routes/user.js");
const {isLoggedIn, isOwner,isReviewAuthor} = require("./middleware.js");
const multer = require("multer");
const {storage} = require("./cloudConfig.js");
const upload = multer({ storage });

//const dbUrl = process.env.ATLASDB_URL;


main()
   .then(()=>{
    console.log("connected to DB");

   })
   .catch((err)=>{
    console.log(err);
   });

   async function main(){
    await mongoose.connect(MONGO_URL);
   }
app.set("view engine","ejs");
app.set("views",path.join(__dirname,'views'));
app.use(express.urlencoded({extended: true})) 
app.use(express.json());
app.use(methodOverride("_method"));
app.set('layout', 'layouts/boilerplate');
app.use(expressLayouts);
app.use(express.static(path.join(__dirname,'/public')));






const sessionOptions = {
    
    secret : "mysupersecretcode",
    resave: false,
    saveUninitialized : true,
    cookie: {
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true,
    },
};





app.use(session(sessionOptions));
app.use(flash());

app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));


passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());





app.use((req, res, next) => {
    res.locals.success = req.flash("success");
    res.locals.error = req.flash("error");
    res.locals.currUser = req.user;
    next();
});


app.use('/',userRouter); 





//Index route
app.get("/listings",async (req,res)=>{
    const allListings = await Listing.find({});
    res.render("index.ejs",{allListings});
})

//new route
app.get("/listings/new",isLoggedIn,(req,res)=>{
    
    res.render("new.ejs");
});

//show route
// SHOW route  ─────────────────────────────────────────────
app.get("/listings/:id", async (req, res) => {
  const { id } = req.params;

  const listing = await Listing.findById(id)
    .populate({ path: "reviews", populate: { path: "author" } })
    .populate("owner");

  // 👇 Pass the token into EJS here
  res.render("show.ejs", {
    listing
                     // (optional but handy)
  });
});


//create route
//create route
app.post("/listings", isLoggedIn, upload.single('listing[image]'), async (req, res) => {
    try {
        const listingData = req.body?.listing;

        if (!listingData) {
            console.error("Missing listing data in form submission:", req.body);
            throw new Error("Form is missing 'listing' data.");
        }

        // Handle uploaded image from Cloudinary
        if (req.file) {
            listingData.image = {
                url: req.file.path,
                filename: req.file.filename
            };
        }

        const newListing = new Listing(listingData);
        newListing.owner = req.user._id;
        await newListing.save();

        req.flash("success", "New Listing Created!");
        res.redirect("/listings");
    } catch (error) {
        console.error("❌ Error processing listing:", error);
        req.flash("error", error.message);
        res.status(500).send("Error: " + error.message);
    }
});


//Edit route
app.get("/listings/:id/edit",isLoggedIn,isOwner, async (req, res) => {
    let { id } = req.params;
    const listing = await Listing.findById(id);
    if (!listing) {
        return res.status(404).send("Listing not found");
    }
    res.render("edit", { listing });
});

//Update route
app.put("/listings/:id", isLoggedIn,isOwner, async (req, res) => {
    let { id } = req.params;


    let updatedData = req.body.listing;

    // If image was edited, structure it properly
    if (updatedData.image) {
        updatedData.image = {
            url: updatedData.image,
            filename: "listingimage" // or keep previous filename
        };
    }

    await Listing.findByIdAndUpdate(id, updatedData);


    req.flash("success", "Listing Updated!");
    res.redirect("/listings");
});

//Delete route
app.delete("/listings/:id",isLoggedIn,isOwner,async (req,res)=>{
    let { id } = req.params;
    let deletedListing = await Listing.findByIdAndDelete(id);
    console.log(deletedListing);
    req.flash("success","Listing Deleted!");
    res.redirect("/listings");
})
//reviews
//Post  ReviewRoute
app.post("/listings/:id/reviews",isLoggedIn, async (req, res) => {
    const listing = await Listing.findById(req.params.id).populate({
  path: "reviews",
  strictPopulate: false
});

   

    if (!listing) {
        return res.status(404).send("Listing not found");
    }

    if (!listing.reviews) {
        listing.reviews = [];
    }

    const reviewData = req.body.review;
if (Array.isArray(reviewData.rating)) {
    reviewData.rating = reviewData.rating[0]; // take the first selected rating
}
reviewData.rating = parseInt(reviewData.rating, 10); // ensure it's a number

const newReview = new Review(reviewData);

    newReview.author = req.user._id;
    listing.reviews.push(newReview);

    await newReview.save();
    await listing.save();
    req.flash("success","New Review Created!");

    res.redirect(`/listings/${listing._id}`);
});


//Delete Review  Route
app.delete("/listings/:id/reviews/:reviewId",isLoggedIn,isReviewAuthor,async(req,res)=>{
    let { id , reviewId } = req.params;

    await Listing.findByIdAndUpdate(id,{$pull: {reviews: reviewId}});
    await Review.findByIdAndDelete(reviewId);
    req.flash("success","Review Deleted!");
    res.redirect(`/listings/${id}`);

})

//app.get("/testListing", async (req,res)=>{
//    let sampleListing = new Listing({
//        title: "My new villa",
//        description: "By the beach",
  //      price: 1200,
    //    location: "Calangute Goa",
      //  country: "India",
    //});
    //await sampleListing.save();
    //console.log("sample was saved");
    //res.send("successful testing");
//});


app.listen(8080,()=>{
    console.log("server is listening to port 8080");
});