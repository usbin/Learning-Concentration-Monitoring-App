import React, {Component} from 'react';
import './Monitor.css';
import Axios from 'axios';
import Webcam from 'webcam-easy';
import * as faceapi from 'face-api.js';


/* -------------------------------------------------------*/
/*                        js code                         */
/*--------------------------------------------------------*/
const modelPath = 'models';
var webcam = {};
var displaySize = {
    height : {},
    width : {}
};
var faceDetection;
var canvas;

function sendData(tag, data){
    Axios({
        method : 'post',
        url : '/',
        data : {
            tag : tag,
            data : data,
            userId : '0x0000'
        }
    })
    .then(function(res){
        console.log('sent yawnTime to DB successfully.')
    })
    .catch(function(err){
        console.error('sending yawnTime to DB failed.')
    });
}
//20회 중 연속된 10회의 감지 안에서 하품이 7회 이상일 경우 => 10개 구간의 평균이 0.7 이상일 경우, true를 리턴.
function isRealYawned(queue){
    var dend = 0;
    var dsor = 10;
    for(var i=0; i<queue.store.length-15; i++){
      dend=0;
      for(var j=15+i-1; j>=i; j--){
        if(queue.get(j).flag){
          dend += 1
        }
      }
      if(dend/dsor >= 0.9){
        return true;
      }
    }
    return false;
}
function startDetection(){
    var yawnQueue = new Queue(20);
    var periodStarted = false;
    faceDetection = setInterval(async () => {
        var webcamElement = document.getElementById('webcam');
        displaySize = {
            height : webcamElement.scrollHeight,
            width : webcamElement.scrollWidth
        }
        const detections = await faceapi.detectAllFaces(
            webcamElement, 
            new faceapi.SsdMobilenetv1Options({
                minConfidence : 0.5, maxResult: 1
            })
        ).withFaceLandmarks(false);
        
        /* landmark 위치가 어긋나는 문제 */
        /* 해결. displaySize를 video height, width와 맞춰주고
        canvas를 displaySize에 맞추고 landmark 그림 */
        const resizedDetections = faceapi.resizeResults(detections, displaySize);
        
        canvas.width = displaySize.width;
        canvas.height = displaySize.height;
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
        faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);
        try{
            var mouth_ratio = (resizedDetections[0].landmarks._positions[66].y-resizedDetections[0].landmarks._positions[62].y)/(resizedDetections[0].landmarks._positions[54].x-resizedDetections[0].landmarks._positions[48].x);
            var betweenLeftEndAndNose = (resizedDetections[0].landmarks._positions[30].x-resizedDetections[0].landmarks._positions[2].x);
            var betweenRightEndAndNose = (resizedDetections[0].landmarks._positions[14].x-resizedDetections[0].landmarks._positions[30].x);

            //주기가 시작된 상태면 (1)현재 시각을 큐에 집어넣고 (2)큐가 꽉 찼을 때 체크 후 (3) 큐를 비움.
            let isDetected = ((betweenLeftEndAndNose*2<betweenRightEndAndNose)&&(mouth_ratio > 0.4)) //왼쪽 yawned
            ||((betweenRightEndAndNose*2<betweenLeftEndAndNose)&&(mouth_ratio > 0.4)) //오른쪽 yawned
            ||((betweenLeftEndAndNose*2>=betweenRightEndAndNose)&&(betweenRightEndAndNose*2>=betweenLeftEndAndNose)&&(mouth_ratio > 0.6));
            //주기가 시작되지 않았을 때+감지됨 => 주기 시작하고 큐에 저장.
            if(!periodStarted && isDetected){
                yawnQueue.enqueue(new DetectedData(true, new Date()));
                periodStarted = true;
            }
            //주기가 시작됨+감지됨+큐가 꽉 차지 않음. => 큐에 저장.
            else if(periodStarted && yawnQueue.store.length < yawnQueue.size){
                yawnQueue.enqueue(new DetectedData(isDetected, new Date()));
            }
            //큐가 꽉 참.
            else if(yawnQueue.store.length >= yawnQueue.size){
                if(isRealYawned(yawnQueue)){
                    //최초 시각 전송.
                    var yawnTime = yawnQueue.dequeue().time;
                    let tag = 'yawnTime';
                    sendData(tag, yawnTime+"");
                    
                }
                yawnQueue = new Queue(20);
                periodStarted = false;
            }
        } catch(e){

        }
    }, 200);
}
function createCanvas(){
    const webcamElement = document.getElementById('webcam');
    canvas = faceapi.createCanvasFromMedia(webcamElement)
    document.getElementById('webcam-container').append(canvas);
    faceapi.matchDimensions(canvas, displaySize);
    
  }
function cameraStarted(){
    //detection-switch의 disabled를 false로
    //detection-switch를 감싼 label에서 disabled class를 제거
    document.getElementById('detection-switch').disabled = false;
    document.getElementById('detectingSwitchLabel').className = 'form-switch';
    
    //errorMsg에 d-none 클래스 붙이기
    //cameraFlip에서 d-none class를 제거
    document.getElementById('errorMsg').className="col-12 alert-danger d-none";
    if( webcam.webcamList.length > 1){
        document.getElementById('cameraFlip').className = 'btn';
    }
};
function cameraStopped(){
    //detection-switch의 disabled를 true로
    //detection-switch의 checked를 false로
    //detection-switch를 감싼 label에 disabled class를 추가.
    document.getElementById('detection-switch').disabled = true;
    document.getElementById('detection-switch').checked= false;
    document.getElementById('detectingSwitchLabel').className = "form-switch disabled";
    clearInterval(faceDetection);

    //errorMsg에 d-none 클래스 추가
    //cameraFlip에 d-none 클래스 추가
    document.getElementById("errorMsg").className = "col-12 alert-danger d-none";
    document.getElementById("cameraFlip").className = "btn d-none";
}

const displayError=(err = '')=>{
    if(err!==''){
        document.getElementById("errorMsg").html(err);
    }
    //errorMsg에서 d-none class를 제거.
    document.getElementById("errorMsg").className = "col-12 alert-danger";
};

/* -------------------------------------------------------*/
/*                 custom component                       */
/*--------------------------------------------------------*/
class WebcamSwitch extends Component{
    constructor(props){
        super(props);
        this.onClick = this.onClick.bind(this);
    }
    onClick(event){
        if(event.target.checked){
            console.log("camera on!");
            event.target.checked = true;
            var webcamElement = document.getElementById('webcam');
            
            webcam = new Webcam(webcamElement, 'user');

        
            console.log("webcam created.");
            webcam.start()
            .then(result =>{
                cameraStarted();
                webcamElement.style.transform = "";
            })
            .catch(err => {
                displayError();
            })    
        }
        else {
            console.log("camera off");
            event.target.checked = false;     
            cameraStopped();
            webcam.stop();
            console.log("webcam stopped");
        }
    }
    render(){
        return(
            <input type="checkbox" id="webcam-switch" onChange={this.onClick}/>
        )
    }
}
class DetectingSwitch extends Component{
    constructor(props){
        super(props);
        this.state={
            disabled : true
        }
        this.toggle = this.toggle.bind(this);
    }
    toggle(){
        this.setState({
            disabled : !this.state.disabled
        })
    }
    onClick(event){
        if(event.target.checked){
            //loadingDetection의 class에서 d-none을 제거
            document.getElementById('loadingDetection').className = "loading"
            Promise.all([
                faceapi.nets.ssdMobilenetv1.load(modelPath),
                faceapi.nets.faceLandmark68Net.load(modelPath)
            ]).then(function(){
                console.log('loaded model successfully.')
                document.getElementById('loadingDetection').className = "loading d-none";
                createCanvas();
                startDetection();
            })
        }
        else{
            //얼굴인식 정지
            clearInterval(faceDetection);
            if(typeof canvas !== "undefined"){
                setTimeout(function() {
                  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
                }, 1000);
              }
        }
    }
    render(){
        return(
            <input type="checkbox" disabled={this.state.disabled} onChange={this.onClick} id="detection-switch"/>
        )
    }
}


/* -------------------------------------------------------*/
/*                main export component                   */
/*--------------------------------------------------------*/
class Monitor extends Component{
    globals = {
        webcamElement : {},//document.getElementById('webcam'),
        webcam : {},//new Webcam(webcamElement, 'user'),
        currentStream : {},
        displaySize : {},
        convas : {},
        faceDetection : {}
    }
    render(){
        return (
            <div className="container mt-1">
                <div className="row">
                    <div className="col-12 col-md-10 col-xl-10 align-top">
                        <div className="row mb-3">
                            <div className="col-md-5 col-6 form-control">
                                <label className="form-switch">
                                    <WebcamSwitch/>
                                    <i></i>
                                    Start Camera
                                </label>  
                                <button id="cameraFlip" className="btn d-none"></button>
                            </div> 
                            <div className="col-md-5 col-6 form-control">
                                <label id='detectingSwitchLabel' className="form-switch disabled">
                                <DetectingSwitch/>
                                <i></i>
                                Start Monitoring
                                </label>      
                            </div>             
                        </div>
                    </div>
                    <div className="col-12 col-md-10 col-xl-10 align-top" id="webcam-container">
                        <div id="loadingDetection" className="loading d-none">
                            Loading Model
                            <div className="spinner-border" role="status">
                                <span className="sr-only"></span>
                            </div>
                        </div>
                        <div id="video-container">
                            <video id="webcam" autoPlay muted playsInline></video>
                        </div>  
                        <div id="errorMsg" className="col-12 alert-danger d-none">
                        Fail to start camera. Please allow permission to access camera.
                         </div>
                    </div>
                </div>
                <script src='face-detection.js'></script>
            </div>
            
        );
    }
}

/* -------------------------------------------------------*/
/*                        자료 구조                        */
/*--------------------------------------------------------*/
class Queue {
    constructor(size){
      this.store = [];
      this.size = size;
    }
    enqueue(item){
      this.store.push(item);
      if(this.store.length > this.size){
        return false;
      }
      console.log("현재 store : "+this.store.length);
      return true;
    }
    dequeue(){
      return this.store.shift();
    }
    get(i){
      return this.store[i];
    }
  }
  class DetectedData{
    constructor(flag, time){
      this.flag = flag;
      this.time = time;
    }
  }

export default Monitor;

  

  