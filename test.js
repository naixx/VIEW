//var intervalometer = require('./intervalometer/intervalometer');
var exp = require('./intervalometer/exposure');
var tv = require('./intervalometer/time-value');
var datajs = require('./work/tl-217/data')
// var datajs = require('./logs/data')


console.log(exp);

exp.init(-7, 19, -1, 0, true, "./logs/data2.js");

exp.status.rampEv = 3.3333333333333335

datajs.data.forEach(value => {

    var rate = exp.calculate("lrt", "auto", value.currentEv, value.lastPhotoLum, value.lastPhotoHistogram, -7, 19);
    console.log("rate = ", rate);

})


