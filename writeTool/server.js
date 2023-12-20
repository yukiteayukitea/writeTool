//=========[require]================================================
const express = require('express'); //Webアプリ作成に必要
const multer = require('multer'); // ファイルアップロードを処理するためのミドルウェア
const cors = require('cors'); // ないとエラーになる
const fs = require('fs'); // ディレクトリ操作用
const util = require('util');//非同期のexecを使用するためのもの(1)
const exec = util.promisify(require('child_process').exec);//非同期のexecを使用するためのもの(2)
//const cluster = require('cluster'); //処理高速化用
const numCPUs = require('os').cpus().length; //CPUのコア数を取得
const path = require('path');

//=========[init var]================================================
const app = express(); //Webアプリの作成
const port = 3001; // 使用するポート番号を指定
const MAXFILES = 1; //アップロードできる最大ファイル数
const UPDIR = 'uploads'; //アップロードするフォルダ
const INTERVAL = 3600000 * 3; //インターバルの時間 3時間
var reloadFlag = false;

//SSL化
const server = require('https').createServer(
    {
        key: fs.readFileSync('./SSL/privatekey.pem'),
        cert: fs.readFileSync('./SSL/cert.pem'),
    },
    app
);

//=========[init func]================================================

//platformIO CLIでコンパイル
async function runPIO(myId) {
    try {
        const { stdout, stderr } = await exec('pio run', { cwd: `${__dirname}/uploads/${myId}` });
        console.log(`stdout: ${stdout}`);
        return 0;//正常終了
    } catch (error) {
        console.error(`Error: ${error.stderr}`);
        return -1;//コンパイルエラー
    }
}

//コンパイル用PIOプロジェクトを作成
async function initPlatformIOProject(myId) {
    try {
        // platformIOのプロジェクトを作成
        const { stdout, stderr } = await exec(`pio init --board m5stack-core-esp32`, { cwd: `${__dirname}/uploads/${myId}` });
        console.log(stdout);
        console.log('Log : Created PIO project.');

        // platform.iniをテンプレートに変更
        await exec(`cp platformio_iot.ini ./uploads/${myId}/platformio.ini`);
        console.log('Log : copy platformio.ini');

        // コンパイルに必要なバイナリファイルをコピー
        await exec(`cp ./src/m5stack_basic_bin/boot_app0.bin ./uploads/${myId}/boot_app0.bin`);
        console.log('Log : copy boot_app0.bin');

        await exec(`cp ./src/m5stack_basic_bin/bootloader.bin ./uploads/${myId}/bootloader.bin`);
        console.log('Log : copy bootloader.bin');
    } catch (error) {
        console.error(`Error: ${error.stderr}`);
    }
}

async function makeManifest(myId) {
    //manifest.jsonの書き換え

    //JSONファイルを読み込む
    await new Promise((resolve, reject) => {
        const manifestJSON = JSON.parse(
            fs.readFileSync(
                path.resolve(__dirname, "manifest.json")
            )
        );
        //新規のファイルを生成
        const newFilePath = path.resolve(`${__dirname}/uploads/${myId}`, `manifest_${myId}.json`);
        resolve([manifestJSON, newFilePath]);
    }).then((result) => {
        //ファイルの内容をコピー
        fs.writeFileSync(
            result[1],
            JSON.stringify(result[0], null, '  '),
            "utf-8"
        );
        console.log('Log : Create Unique Manifest >> ' + myId);
    }).catch((error) => {
        console.log(error);
    });
}

async function makeUniqueDir(myId) {
    //ディレクトリの作成
    fs.mkdir(`uploads/${myId}`, { recursive: true }, (err) => {
        if (err) { throw err; }
        console.log(`Log : Create Unique Directry >> ${myId}`);
    });
}

async function initId() {
    //UUIDの設定
    const myId = crypto.randomUUID();
    console.log(`Log : Create UUID >> ${myId}`);

    // アップロードされたファイルを保存するディレクトリを指定
    const storage = multer.diskStorage({
        destination: function (req, file, cb) {
            cb(null, `uploads/${myId}/src`); // uploads/<UUID>/srcを保存場所に指定
        },
        filename: function (req, file, cb) {
            cb(null, file.originalname); // 保存するファイル名はオリジナル
        }
    });

    const upload = multer({ storage });

    return { myId, upload };
}

//アップロード用ファイルを初期化する
async function initUpDir(myId, upload) {
    await makeUniqueDir(myId);

    await makeManifest(myId);

    await initPlatformIOProject(myId);

    console.log('Log : End init directory. UUID : ' + myId);
}

//蓄積ファイルの自動削除
const deleteDirectoryWithAllContents = async (path) => {
    // ファイルの存在チェック
    if (fs.existsSync(path)) {
        try {
            // ファイル（ディレクトリ）を再帰的に削除する
            await fs.promises.rm(path, { recursive: true });
            console.log("Log : Delete Directory.");

            // 新しいディレクトリを作成する
            fs.mkdir('uploads', { recursive: true }, (err) => {
                if (err) {
                    throw err;
                }
                console.log('Log : Make new [uploads] Directory.');
            });
        } catch (error) {
            console.error("Error : Cause [Fire Delete]", error);
        }
    } else {
        console.log("Warning : Not Found [uploads].");
    }
};

//=========[main]================================================

// if (cluster.isMaster) {
//     for (let i = 0; i < numCPUs; i++) {
//         // Create a worker
//         cluster.fork();
//     }
// } else {

//CORSを使用する設定
app.use(cors());

//アプリのルートディレクトリを設定
app.use(express.static(__dirname + ''));

//ファイル自動削除のインターバルを設定
setInterval(deleteDirectoryWithAllContents, INTERVAL, UPDIR);

//=========[page setting]================================================
//メインページ
app.get('/main', async (req, res) => {
    res.sendFile(`${__dirname}/index.html`);
});

// ファイルアップロードのエンドポイント
app.post('/upload', async (req, res) => {
    console.log('Log : POST /upload');
    const { myId, upload } = await initId();
    await initUpDir(myId, upload);
    console.log(myId);

    try {
        // 非同期処理を実行する前にファイルのアップロードを待つ
        await new Promise((resolve, reject) => {
            upload.array('prgFile', MAXFILES)(req, res, (err) => {
                if (err) {
                    console.error(`Error: ${err.message}`);
                    //リロードせずファイル送信されたら
                    if (err.message == "Unexpected field") {
                        reloadFlag = true;
                    }
                    else {
                        reloadFlag = false;
                    }
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
        console.log('Log : Uploaded files.');

        // ここで非同期処理を実行
        var compileResult = await runPIO(myId);

        // コンパイルが終了したらresponseを返す
        if (compileResult != -1) {
            //正常
            res.json(myId);
        }
        else {
            //コンパイルエラー
            res.json("compileError");
        }
    } catch (error) {
        // エラーハンドリング
        // どうせレスポンスできないので今のところ意味なし
        if (reloadFlag == true) {
            res.status(510).json("reloadError");
        }
        else {
            res.status(511).json("serverError");
        }
    }
});

//サーバーを起動
server.listen(port, () => {
    console.log(`Log :Start Server PORT[${port}]`);
});

// }



