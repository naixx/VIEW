//var intervalometer = require('./intervalometer/intervalometer');
var exp = require('./intervalometer/exposure');
var tv = require('./intervalometer/time-value');
var datajs = require('./logs/data')


console.log(exp);

exp.init(0, 0, -1.5, 1, true, "./logs/data2.js");

datajs.data.forEach(value => {

    exp.calculate("lrt", "auto", value.currentEv, value.lastPhotoLum, value.lastPhotoHistogram, 0, 0);

})


