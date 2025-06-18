const express = require('express');
const app = new express();
app.use(express.static('./public'));
app.listen(80, () => {console.log("http://localhost/")});