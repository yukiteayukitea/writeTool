// const ip = require('ip');
const MAXFILES = 1; //アップロードできる最大ファイル数
let myId = "";

//クリックできる書き込みボタンを設置
async function rewriteHTML(myId) {
    console.log(myId);
    var mydiv = document.getElementById('orgPrg');
    
    mydiv.innerHTML=`<esp-web-install-button manifest="uploads/${myId}/manifest_${myId}.json">
            <button type="button" class="write" slot="activate">書き込む</button>
        </esp-web-install-button>`;
    console.log(mydiv.innerHTML);
}

window.addEventListener('DOMContentLoaded', async() => {

    //送信ボタンのHTMLを取得
    const upbtn = document.getElementById("upbtn");

    //FormDataオブジェクトの初期化
    const fd = new FormData();

    //送信ボタンが押されたら
    upbtn.addEventListener('click', async(e)=> {
        //デフォルトのアクションを中止
        e.preventDefault();

        //ファイル情報を取得
        var fileInput = document.querySelector('input[type="file"]');
        //ファイルが選択されていなかった場合にアラートを表示し、フォームの送信を中止
        if (fileInput.files.length === 0) {
            alert("ファイルを選択してください。");
            return false; // フォームの送信を中止
        }

        // ファイルの拡張子を取得
        var fileName = fileInput.files[0].name;
        // ファイルの拡張子を取得
        var fileExtension = fileName.split('.').pop();
        // 拡張子が.cppでない場合にアラートを表示し、フォームの送信を中止
        if (fileExtension !== 'cpp') {
            alert("ファイルの拡張子は.cppである必要があります。");
            return false; // フォームの送信を中止
        }

        //ダミーボタンの作成
        var mydiv = document.getElementById('orgPrg');
        mydiv.innerHTML=`<button type="button" class="notwrite" slot="activate">書き込む</button>`;
        console.log(mydiv.innerHTML);

        //ファイル選択のinput要素を取得
        const prgFile = document.querySelector('input[name=prgFile]');

        //ファイルをfdに格納
        for (let i = 0; i < MAXFILES; i++) {
            fd.append('prgFile', prgFile.files[i]);
        }

        console.log(...fd.entries());

        //フォームの入力値をPOST
        fetch( '/upload', {
            method: 'POST',
            mode: 'cors',
            body: fd
        })
        .then((res) =>{
            //responseが帰ってきたら
            if (!res.ok) {
                //正常なレスポンスではない場合
                console.log("Error : But response.");
                console.error('response.ok:', response.ok);
                console.error('response.status:', response.status);
                console.error('response.statusText:', response.statusText);
                throw new Error(response.statusText);
            }
            else {
                console.log(res);
                return(res.json());
            }
        })
        .then(async(json)=> {
            //responseがjson形式なら
            console.log("Log : Response ok.");
            console.log(json);
            
            //ボタンの書き換え
            if (json == "compileError") {
                //コンパイルエラーボタン
                mydiv.innerHTML=`<button type="button" class="Errwrite" slot="activate" onclick="window.location.reload();">コンパイルエラー</button>`;
            }
            else {
                //クリックできる書き込みボタンに書き換え
                await rewriteHTML(json);
            }
        })
        .catch((error) => {
            //どこかでエラーが発生したら
            //リロードしていないかorサーバーが死んでいるかボタン
            console.error("Error : Response error.");
            console.log(error);
            mydiv.innerHTML=`<button type="button" class="Errwrite" slot="activate" onclick="window.location.reload();">リロード</button>`;
        });
    });
});
