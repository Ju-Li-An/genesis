/*
	Copyright (C) 2016  Julien Le Fur

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
	
*/
var env = process.env;
var http = require('http');
var dataAccess = (env.MODE=='file')?require(__base + 'lib/dataAccess/fsAccess'):require(__base + 'lib/dataAccess/mongoAccess');
var fs = require('fs');
var async = require('async');

exports.execute = function (request, response, runCtxt, callback) {
    runCtxt.debug('STEP RESPONSE - Start');
    async.waterfall([
        function (callback) {
			var start = new Date().getTime();
			dataAccess.getJDD(runCtxt.jdd,(err,data)=>{
				return callback(err, data,start);
			});
        },
        function (jdd,start,callback) {
            runCtxt.info('STEP RESPONSE - template ' + jdd.template);
     	    if(runCtxt.operation.delay != undefined){
				jdd.delay=runCtxt.operation.delay;
			}else{
				if(jdd.delay == undefined)
					jdd.delay=0;
			}
			dataAccess.getTemplate(runCtxt,jdd.template, (err,tempFn) => {
				if(err){
					return callback(err);
				}
				var resultText = tempFn(runCtxt.parameters);
				runCtxt.debug(resultText);
				setTimeout(function(){
					runCtxt.info('STEP RESPONSE - Delay:'+jdd.delay + ' - duration:'+(new Date().getTime()-start)+' ms');
					response.writeHead(200, { 
						'Content-Type': runCtxt.operation.responseType!=undefined?runCtxt.operation.responseType:'text/plain'
					});
					response.write(resultText);
					response.end();
					return callback(err,jdd,new Date().getTime());
				},jdd.delay);
			});
        },
        function (jdd, start, callback) {
        	if(jdd.callback===undefined || jdd.callback.template===undefined){
        		return callback(null);
        	}
        	else{
	        	dataAccess.getTemplate(runCtxt,jdd.callback.template, (err,tempFn) => {
	        		if(err){
					return callback(err);
				}
	        		var resultText = tempFn(runCtxt.parameters);
				runCtxt.debug(resultText);
	        		setTimeout(function(){
						var options={
							hostname:jdd.callback.hostname,
							port:jdd.callback.port,
							path:jdd.callback.path,
							method:'POST',
							headers:{
								'Content-Length': resultText.length
							}
						};
						for(idHeader in jdd.callback.headers){
			                var h = jdd.callback.headers[idHeader];
			                options.headers[h.name]=h.value;
						}
						var callback_res='';
						var req=http.request(options,(res)=>{
							res.on('data',(chunk)=>{
								callback_res+=chunk;
							});
							res.on('end',()=>{
								if(res.statusCode!='200'){
									runCtxt.error('STEP CALLBACK - '+ callback_res);
								}
								return callback(null);
							});
						});
						req.on('error',(e)=>{
							runCtxt.error('STEP CALLBACK - '+e.message);
							return callback(null);
						});

						runCtxt.info('STEP CALLBACK - URL: http://'+jdd.callback.hostname+':'+jdd.callback.port+jdd.callback.path);
						runCtxt.info('STEP CALLBACK - Delay:'+jdd.callback.delay + ' - duration:'+(new Date().getTime()-start)+' ms');

						req.write(resultText);
						req.end();
						
					},jdd.callback.delay);
        		});
	        }
        }
    ], function (err, result) {
	runCtxt.stats.responseTime=new Date().getTime();
        return callback(err,request, response, runCtxt);
    });   
}