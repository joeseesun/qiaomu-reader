const keys = ["title", "description", "usb-description", "pair", "repair", "address", "address-help", "paired", "not-paired", "usb-done", "pairing", "close", "test", "connect-send", "connecting", "connected", "send", "cancel", "cancelled", "busy", "sending", "verifying", "sent", "error-address", "error-host", "error-usb", "error-key", "error-file", "error-verify", "error-network", "settings-description"];
const text = {
  en: ["Connect Kindle", "Send books over Wi-Fi while KOReader is open. No Calibre required.", "First, exit KOReader and connect Kindle by USB. Pairing adds this vault’s public key and enables key-only connections when KOReader opens.", "Pair over USB", "Pair again", "Device address", "After pairing, safely eject Kindle and open KOReader with Wi-Fi on. Find its address under Tools → Network → SSH server.", "USB pairing saved. Connect Kindle over Wi-Fi to test.", "Pair over USB once to get started.", "Paired. Safely eject and unplug Kindle, then open KOReader and enable Wi-Fi.", "Pairing…", "Close", "Test connection", "Connect and send", "Connecting to Kindle…", "Connected. Ready to send books.", "Send to Kindle", "Cancel", "Transfer cancelled.", "A book is already being sent. Wait for it to finish.", "Sending to Kindle… {0}%", "Verifying the transferred book…", "Sent “{0}” to Kindle.", "Enter Kindle’s local IPv4 address, for example 192.168.1.100.", "Kindle’s identity has changed. Verify the device and pair again over USB.", "Exit KOReader and connect Kindle by USB. Select its drive and retry pairing.", "The pairing key is unavailable or was rejected. Pair again over USB.", "Choose an unchanged, supported book in this vault, up to 512 MB.", "The transferred file failed verification. The original book was kept; retry sending.", "Could not connect. Keep KOReader and Wi-Fi on, check the address, and retry.", "Pair once, then send books from the library’s context menu."],
  zh: ["连接 Kindle", "KOReader 打开时，可通过 Wi-Fi 发送图书，无需 Calibre。", "首次请退出 KOReader，再用 USB 连接 Kindle。配对会写入本仓库的公钥，并在 KOReader 启动时启用密钥连接。", "通过 USB 配对", "重新配对", "设备地址", "配对后安全弹出 Kindle，打开 KOReader 并连接 Wi-Fi。在「工具 → 网络 → SSH 服务器」查看地址。", "已保存 USB 配对，请连接 Wi-Fi 后测试。", "先通过 USB 配对一次，即可开始使用。", "配对完成。请安全弹出并拔下 USB，打开 KOReader 后连接 Wi-Fi。", "正在配对…", "关闭", "测试连接", "连接并发送", "正在连接 Kindle…", "连接成功，可以发送图书。", "发送到 Kindle", "取消", "已取消发送。", "正在发送一本图书，请等待完成。", "正在发送到 Kindle… {0}%", "正在回读校验图书…", "已将《{0}》发送到 Kindle。", "请输入 Kindle 的局域网 IPv4 地址，例如 192.168.1.100。", "Kindle 的设备身份已变化。请核对设备，再通过 USB 重新配对。", "请退出 KOReader 并用 USB 连接 Kindle，选择它的磁盘后重试配对。", "配对密钥不可用或认证失败，请通过 USB 重新配对。", "请选择本仓库内未被修改、格式受支持且不超过 512 MB 的图书。", "传输文件校验失败，原有图书未被替换，请重新发送。", "无法连接。请保持 KOReader 和 Wi-Fi 开启，核对设备地址后重试。", "配对后，可在书库右键菜单中无线发送图书。"],
  ja: ["Kindle に接続", "KOReader を開いている間、Wi-Fi で本を送れます。Calibre は不要です。", "初回は KOReader を終了し、Kindle を USB 接続してください。保管庫の公開鍵を登録し、KOReader 起動時に鍵認証を有効にします。", "USB でペアリング", "再ペアリング", "端末のアドレス", "ペアリング後、安全に取り外し、KOReader と Wi-Fi を有効にしてください。「ツール → ネットワーク → SSH サーバー」でアドレスを確認できます。", "USB ペアリングを保存しました。Wi-Fi で接続を確認してください。", "初回に USB でペアリングしてください。", "ペアリング完了。安全に取り外して USB を抜き、KOReader と Wi-Fi を有効にしてください。", "ペアリング中…", "閉じる", "接続をテスト", "接続して送信", "Kindle に接続中…", "接続しました。本を送信できます。", "Kindle に送信", "キャンセル", "送信をキャンセルしました。", "別の本を送信中です。完了までお待ちください。", "Kindle に送信中… {0}%", "送信した本を照合中…", "「{0}」を Kindle に送信しました。", "Kindle のローカル IPv4 アドレスを入力してください。例：192.168.1.100。", "端末の識別情報が変わりました。端末を確認し、USB で再ペアリングしてください。", "KOReader を終了し、Kindle を USB 接続してください。ドライブを選んで再試行してください。", "認証鍵が利用できないか拒否されました。USB で再ペアリングしてください。", "保管庫内の変更されていない対応形式の本を選んでください。上限は 512 MB です。", "送信後の照合に失敗しました。元の本は保持されています。再送信してください。", "接続できません。KOReader と Wi-Fi を有効にし、アドレスを確認して再試行してください。", "ペアリング後、本棚の右クリックメニューから送信できます。"],
  ru: ["Подключить Kindle", "Отправляйте книги по Wi-Fi, пока открыт KOReader. Calibre не требуется.", "Сначала закройте KOReader и подключите Kindle по USB. Сопряжение добавит открытый ключ хранилища и включит вход по ключу при запуске KOReader.", "Сопряжение по USB", "Повторить сопряжение", "Адрес устройства", "После сопряжения безопасно извлеките Kindle, откройте KOReader и включите Wi-Fi. Адрес указан в Инструменты → Сеть → SSH-сервер.", "Сопряжение сохранено. Проверьте подключение по Wi-Fi.", "Для начала выполните сопряжение по USB.", "Готово. Безопасно извлеките Kindle, отключите USB, откройте KOReader и включите Wi-Fi.", "Сопряжение…", "Закрыть", "Проверить соединение", "Подключить и отправить", "Подключение к Kindle…", "Подключено. Можно отправлять книги.", "Отправить на Kindle", "Отмена", "Отправка отменена.", "Книга уже отправляется. Дождитесь завершения.", "Отправка на Kindle… {0}%", "Проверка переданной книги…", "Книга «{0}» отправлена на Kindle.", "Введите локальный IPv4-адрес Kindle, например 192.168.1.100.", "Идентификатор Kindle изменился. Проверьте устройство и повторите сопряжение по USB.", "Закройте KOReader и подключите Kindle по USB. Выберите его диск и повторите сопряжение.", "Ключ недоступен или отклонён. Повторите сопряжение по USB.", "Выберите неизменённую книгу поддерживаемого формата в этом хранилище, до 512 МБ.", "Проверка файла не пройдена. Исходная книга сохранена; повторите отправку.", "Не удалось подключиться. Откройте KOReader, включите Wi-Fi, проверьте адрес и повторите попытку.", "После сопряжения отправляйте книги через контекстное меню библиотеки."],
  de: ["Kindle verbinden", "Bücher über WLAN senden, während KOReader geöffnet ist. Ohne Calibre.", "Zuerst KOReader beenden und Kindle per USB verbinden. Die Kopplung hinterlegt den öffentlichen Schlüssel dieses Vaults und aktiviert die Schlüsselanmeldung beim Start von KOReader.", "Über USB koppeln", "Erneut koppeln", "Geräteadresse", "Nach dem Koppeln Kindle sicher auswerfen, KOReader öffnen und WLAN aktivieren. Die Adresse steht unter Werkzeuge → Netzwerk → SSH-Server.", "USB-Kopplung gespeichert. Verbindung über WLAN testen.", "Zum Start einmal über USB koppeln.", "Gekoppelt. Kindle sicher auswerfen, USB trennen, KOReader öffnen und WLAN aktivieren.", "Kopplung läuft…", "Schließen", "Verbindung testen", "Verbinden und senden", "Verbindung zu Kindle wird hergestellt…", "Verbunden. Bücher können gesendet werden.", "An Kindle senden", "Abbrechen", "Übertragung abgebrochen.", "Ein Buch wird bereits gesendet. Bitte warten.", "Übertragung an Kindle… {0}%", "Übertragenes Buch wird geprüft…", "„{0}“ an Kindle gesendet.", "Lokale IPv4-Adresse des Kindle eingeben, zum Beispiel 192.168.1.100.", "Die Geräteidentität hat sich geändert. Kindle prüfen und erneut per USB koppeln.", "KOReader beenden und Kindle per USB verbinden. Laufwerk auswählen und Kopplung wiederholen.", "Der Schlüssel fehlt oder wurde abgelehnt. Erneut über USB koppeln.", "Ein unverändertes Buch in einem unterstützten Format aus diesem Vault wählen, bis 512 MB.", "Dateiprüfung fehlgeschlagen. Das ursprüngliche Buch blieb erhalten; erneut senden.", "Verbindung fehlgeschlagen. KOReader und WLAN einschalten, Adresse prüfen und erneut versuchen.", "Nach der Kopplung Bücher über das Kontextmenü der Bibliothek senden."],
  fr: ["Connecter Kindle", "Envoyez des livres par Wi-Fi lorsque KOReader est ouvert. Sans Calibre.", "Fermez d’abord KOReader et branchez Kindle en USB. L’association ajoute la clé publique de ce coffre et active l’authentification par clé au démarrage de KOReader.", "Associer par USB", "Associer à nouveau", "Adresse de l’appareil", "Après l’association, éjectez Kindle, ouvrez KOReader et activez le Wi-Fi. L’adresse se trouve dans Outils → Réseau → Serveur SSH.", "Association USB enregistrée. Testez la connexion Wi-Fi.", "Commencez par associer Kindle par USB.", "Association terminée. Éjectez Kindle, débranchez l’USB, ouvrez KOReader et activez le Wi-Fi.", "Association en cours…", "Fermer", "Tester la connexion", "Connecter et envoyer", "Connexion à Kindle…", "Connecté. Vous pouvez envoyer des livres.", "Envoyer vers Kindle", "Annuler", "Transfert annulé.", "Un livre est déjà en cours d’envoi. Patientez.", "Envoi vers Kindle… {0}%", "Vérification du livre transféré…", "« {0} » a été envoyé vers Kindle.", "Saisissez l’adresse IPv4 locale de Kindle, par exemple 192.168.1.100.", "L’identité de Kindle a changé. Vérifiez l’appareil et associez-le à nouveau par USB.", "Fermez KOReader et branchez Kindle en USB. Sélectionnez son disque et réessayez.", "La clé est indisponible ou refusée. Associez Kindle à nouveau par USB.", "Choisissez dans ce coffre un livre inchangé, dans un format pris en charge et de 512 Mo maximum.", "La vérification a échoué. Le livre d’origine est conservé ; réessayez l’envoi.", "Connexion impossible. Gardez KOReader et le Wi-Fi actifs, vérifiez l’adresse et réessayez.", "Après l’association, envoyez des livres depuis le menu contextuel de la bibliothèque."],
  es: ["Conectar Kindle", "Envía libros por Wi-Fi mientras KOReader está abierto. Sin Calibre.", "Primero cierra KOReader y conecta Kindle por USB. El enlace añade la clave pública de esta bóveda y activa la conexión con clave al abrir KOReader.", "Enlazar por USB", "Volver a enlazar", "Dirección del dispositivo", "Tras enlazar, expulsa Kindle de forma segura, abre KOReader y activa Wi-Fi. Consulta la dirección en Herramientas → Red → Servidor SSH.", "Enlace USB guardado. Prueba la conexión por Wi-Fi.", "Enlaza una vez por USB para empezar.", "Enlazado. Expulsa Kindle, desconecta el USB, abre KOReader y activa Wi-Fi.", "Enlazando…", "Cerrar", "Probar conexión", "Conectar y enviar", "Conectando con Kindle…", "Conectado. Ya puedes enviar libros.", "Enviar a Kindle", "Cancelar", "Transferencia cancelada.", "Ya se está enviando un libro. Espera a que termine.", "Enviando a Kindle… {0}%", "Verificando el libro transferido…", "Se envió «{0}» a Kindle.", "Introduce la dirección IPv4 local de Kindle, por ejemplo 192.168.1.100.", "La identidad de Kindle ha cambiado. Comprueba el dispositivo y vuelve a enlazarlo por USB.", "Cierra KOReader y conecta Kindle por USB. Selecciona su unidad y vuelve a intentar el enlace.", "La clave no está disponible o fue rechazada. Vuelve a enlazar por USB.", "Elige un libro sin modificar de esta bóveda, en un formato compatible y de hasta 512 MB.", "El archivo no superó la verificación. Se conservó el libro original; vuelve a enviarlo.", "No se pudo conectar. Mantén KOReader y Wi-Fi activos, comprueba la dirección y reintenta.", "Tras enlazar, envía libros desde el menú contextual de la biblioteca."],
  ko: ["Kindle 연결", "KOReader가 열려 있을 때 Wi-Fi로 책을 보냅니다. Calibre는 필요하지 않습니다.", "먼저 KOReader를 종료하고 Kindle을 USB로 연결하세요. 보관함의 공개 키를 등록하고 KOReader 실행 시 키 인증 연결을 활성화합니다.", "USB로 페어링", "다시 페어링", "기기 주소", "페어링 후 Kindle을 안전하게 꺼내고 KOReader와 Wi-Fi를 켜세요. 도구 → 네트워크 → SSH 서버에서 주소를 확인할 수 있습니다.", "USB 페어링을 저장했습니다. Wi-Fi 연결을 테스트하세요.", "처음에는 USB로 한 번 페어링하세요.", "페어링 완료. 안전하게 꺼내 USB를 분리한 뒤 KOReader와 Wi-Fi를 켜세요.", "페어링 중…", "닫기", "연결 테스트", "연결 후 보내기", "Kindle에 연결 중…", "연결되었습니다. 책을 보낼 수 있습니다.", "Kindle로 보내기", "취소", "전송을 취소했습니다.", "이미 책을 전송 중입니다. 완료될 때까지 기다려 주세요.", "Kindle로 전송 중… {0}%", "전송한 책을 검증 중…", "『{0}』을 Kindle로 보냈습니다.", "Kindle의 로컬 IPv4 주소를 입력하세요. 예: 192.168.1.100.", "Kindle의 기기 정보가 변경되었습니다. 기기를 확인한 뒤 USB로 다시 페어링하세요.", "KOReader를 종료하고 Kindle을 USB로 연결하세요. 기기 드라이브를 선택해 다시 시도하세요.", "인증 키를 사용할 수 없거나 거부되었습니다. USB로 다시 페어링하세요.", "이 보관함에서 변경되지 않은 지원 형식의 책을 선택하세요. 최대 512 MB입니다.", "파일 검증에 실패했습니다. 기존 책은 유지됩니다. 다시 전송하세요.", "연결할 수 없습니다. KOReader와 Wi-Fi를 켜고 주소를 확인한 뒤 다시 시도하세요.", "페어링 후 서재의 오른쪽 클릭 메뉴에서 책을 보낼 수 있습니다."],
  pt: ["Conectar Kindle", "Envie livros por Wi-Fi enquanto o KOReader estiver aberto. Sem Calibre.", "Primeiro, feche o KOReader e conecte o Kindle por USB. O pareamento adiciona a chave pública deste cofre e ativa a autenticação por chave ao abrir o KOReader.", "Parear por USB", "Parear novamente", "Endereço do dispositivo", "Após parear, ejete o Kindle com segurança, abra o KOReader e ative o Wi-Fi. Veja o endereço em Ferramentas → Rede → Servidor SSH.", "Pareamento USB salvo. Teste a conexão por Wi-Fi.", "Para começar, pareie uma vez por USB.", "Pareamento concluído. Ejete o Kindle, desconecte o USB, abra o KOReader e ative o Wi-Fi.", "Pareando…", "Fechar", "Testar conexão", "Conectar e enviar", "Conectando ao Kindle…", "Conectado. Pronto para enviar livros.", "Enviar para Kindle", "Cancelar", "Transferência cancelada.", "Um livro já está sendo enviado. Aguarde o término.", "Enviando para Kindle… {0}%", "Verificando o livro transferido…", "“{0}” foi enviado para o Kindle.", "Digite o endereço IPv4 local do Kindle, por exemplo 192.168.1.100.", "A identidade do Kindle mudou. Verifique o dispositivo e pareie novamente por USB.", "Feche o KOReader e conecte o Kindle por USB. Selecione a unidade e tente parear novamente.", "A chave está indisponível ou foi rejeitada. Pareie novamente por USB.", "Escolha neste cofre um livro sem alterações, em formato compatível e com até 512 MB.", "A verificação falhou. O livro original foi preservado; tente enviar novamente.", "Não foi possível conectar. Mantenha KOReader e Wi-Fi ativos, confira o endereço e tente novamente.", "Após parear, envie livros pelo menu de contexto da biblioteca."],
};
const flow = {
  "zh": {
    "kindle.step-usb": "1. USB 配对",
    "kindle.usb-complete": "1. 已配对",
    "kindle.step-wifi": "2. 无线连接",
    "kindle.usb-description": "退出 Kindle 上的 KOReader，再用 USB 连接电脑。",
    "kindle.address-help": "先在电脑弹出 Kindle，再拔线。打开 KOReader，连接与电脑相同的 Wi-Fi。",
    "kindle.find": "查找 Kindle",
    "kindle.finding": "正在查找 Kindle…",
    "kindle.found": "已找到，点击下方按钮即可连接。",
    "kindle.not-found": "没有找到。请保持 KOReader 打开，确认两台设备连接同一 Wi-Fi 后重试。",
    "kindle.usb-done": "USB 配对完成。现在可以拔线，进行无线连接。"
  },
  "en": {
    "kindle.step-usb": "1. USB pairing",
    "kindle.usb-complete": "1. Paired",
    "kindle.step-wifi": "2. Wireless connection",
    "kindle.usb-description": "Exit KOReader on Kindle, then connect it to your computer by USB.",
    "kindle.address-help": "Safely eject Kindle and unplug USB. Open KOReader and connect to the same Wi-Fi as your computer.",
    "kindle.find": "Find Kindle",
    "kindle.finding": "Finding Kindle…",
    "kindle.found": "Found. Use the button below to connect.",
    "kindle.not-found": "No device found. Keep KOReader open and connect both devices to the same Wi-Fi, then retry.",
    "kindle.usb-done": "USB pairing complete. Unplug to continue over Wi-Fi."
  },
  "ja": {
    "kindle.step-usb": "1. USB でペアリング",
    "kindle.usb-complete": "1. ペアリング済み",
    "kindle.step-wifi": "2. ワイヤレス接続",
    "kindle.usb-description": "Kindle の KOReader を終了し、USB でパソコンに接続します。",
    "kindle.address-help": "USB を抜き、KOReader を開きます。Kindle とパソコンを同じ Wi-Fi に接続してください。",
    "kindle.find": "Kindle を探す",
    "kindle.finding": "Kindle を検索中…",
    "kindle.found": "見つかりました。下のボタンで接続できます。",
    "kindle.not-found": "見つかりません。KOReader を開き、両方を同じ Wi-Fi に接続して再試行してください。",
    "kindle.usb-done": "USB ペアリング完了。USB を抜いて次へ進んでください。"
  },
  "ru": {
    "kindle.step-usb": "1. Сопряжение по USB",
    "kindle.usb-complete": "1. Сопряжено",
    "kindle.step-wifi": "2. Беспроводное подключение",
    "kindle.usb-description": "Закройте KOReader на Kindle и подключите Kindle к компьютеру по USB.",
    "kindle.address-help": "Отключите USB и откройте KOReader. Подключите Kindle и компьютер к одной сети Wi-Fi.",
    "kindle.find": "Найти Kindle",
    "kindle.finding": "Поиск Kindle…",
    "kindle.found": "Найдено. Нажмите кнопку ниже для подключения.",
    "kindle.not-found": "Устройство не найдено. Откройте KOReader, подключите оба устройства к одной сети Wi-Fi и повторите попытку.",
    "kindle.usb-done": "Сопряжение готово. Отключите USB для подключения по Wi-Fi."
  },
  "de": {
    "kindle.step-usb": "1. USB-Kopplung",
    "kindle.usb-complete": "1. Gekoppelt",
    "kindle.step-wifi": "2. WLAN-Verbindung",
    "kindle.usb-description": "KOReader auf Kindle beenden und Kindle per USB mit dem Computer verbinden.",
    "kindle.address-help": "USB trennen und KOReader öffnen. Kindle und Computer mit demselben WLAN verbinden.",
    "kindle.find": "Kindle suchen",
    "kindle.finding": "Kindle wird gesucht…",
    "kindle.found": "Gefunden. Mit der Schaltfläche unten verbinden.",
    "kindle.not-found": "Nicht gefunden. KOReader geöffnet lassen, beide Geräte mit demselben WLAN verbinden und erneut versuchen.",
    "kindle.usb-done": "USB-Kopplung abgeschlossen. USB trennen und per WLAN fortfahren."
  },
  "fr": {
    "kindle.step-usb": "1. Association USB",
    "kindle.usb-complete": "1. Associé",
    "kindle.step-wifi": "2. Connexion Wi-Fi",
    "kindle.usb-description": "Fermez KOReader sur Kindle, puis branchez-le à votre ordinateur par USB.",
    "kindle.address-help": "Débranchez l’USB et ouvrez KOReader. Connectez Kindle et l’ordinateur au même Wi-Fi.",
    "kindle.find": "Trouver Kindle",
    "kindle.finding": "Recherche de Kindle…",
    "kindle.found": "Trouvé. Utilisez le bouton ci-dessous pour connecter.",
    "kindle.not-found": "Aucun appareil trouvé. Gardez KOReader ouvert, connectez les deux appareils au même Wi-Fi et réessayez.",
    "kindle.usb-done": "Association terminée. Débranchez l’USB pour continuer en Wi-Fi."
  },
  "es": {
    "kindle.step-usb": "1. Vinculación USB",
    "kindle.usb-complete": "1. Vinculado",
    "kindle.step-wifi": "2. Conexión Wi-Fi",
    "kindle.usb-description": "Cierra KOReader en Kindle y conéctalo al ordenador por USB.",
    "kindle.address-help": "Desconecta el USB y abre KOReader. Conecta Kindle y el ordenador a la misma red Wi-Fi.",
    "kindle.find": "Buscar Kindle",
    "kindle.finding": "Buscando Kindle…",
    "kindle.found": "Encontrado. Usa el botón inferior para conectar.",
    "kindle.not-found": "No se encontró. Mantén KOReader abierto, conecta ambos dispositivos a la misma red Wi-Fi e inténtalo de nuevo.",
    "kindle.usb-done": "Vinculación completa. Desconecta el USB para continuar por Wi-Fi."
  },
  "ko": {
    "kindle.step-usb": "1. USB 페어링",
    "kindle.usb-complete": "1. 페어링 완료",
    "kindle.step-wifi": "2. 무선 연결",
    "kindle.usb-description": "Kindle에서 KOReader를 종료한 뒤 USB로 컴퓨터에 연결하세요.",
    "kindle.address-help": "USB를 분리하고 KOReader를 여세요. Kindle과 컴퓨터를 같은 Wi-Fi에 연결하세요.",
    "kindle.find": "Kindle 찾기",
    "kindle.finding": "Kindle 검색 중…",
    "kindle.found": "찾았습니다. 아래 버튼으로 연결하세요.",
    "kindle.not-found": "찾지 못했습니다. KOReader를 열고 두 기기를 같은 Wi-Fi에 연결한 뒤 다시 시도하세요.",
    "kindle.usb-done": "USB 페어링 완료. USB를 분리하고 Wi-Fi로 계속하세요."
  },
  "pt": {
    "kindle.step-usb": "1. Pareamento USB",
    "kindle.usb-complete": "1. Pareado",
    "kindle.step-wifi": "2. Conexão Wi-Fi",
    "kindle.usb-description": "Feche o KOReader no Kindle e conecte-o ao computador por USB.",
    "kindle.address-help": "Desconecte o USB e abra o KOReader. Conecte Kindle e computador à mesma rede Wi-Fi.",
    "kindle.find": "Buscar Kindle",
    "kindle.finding": "Buscando Kindle…",
    "kindle.found": "Encontrado. Use o botão abaixo para conectar.",
    "kindle.not-found": "Não encontrado. Mantenha o KOReader aberto, conecte os dois dispositivos à mesma rede Wi-Fi e tente novamente.",
    "kindle.usb-done": "Pareamento concluído. Desconecte o USB para continuar por Wi-Fi."
  }
};
export const KINDLE_TEXT = Object.fromEntries(Object.entries(text).map(([language, values]) => {
  if (values.length !== keys.length) throw new Error(`Invalid Kindle language pack: ${language}`);
  return [language, { ...Object.fromEntries(keys.map((key, i) => [`kindle.${key}`, values[i]])), ...flow[language] }];
}));
