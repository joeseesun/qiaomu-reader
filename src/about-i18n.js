// Column order follows the existing Reader language registry.
const languages = ["zh", "en", "ru", "ja", "es", "fr", "de", "ko", "pt"];
const messages = {
  "about.tagline": ["阅读、划线，让好想法留下来。", "Read, highlight, and keep good ideas.", "Читайте, выделяйте и сохраняйте идеи.", "読んで、線を引いて、アイデアを残す。", "Lee, subraya y conserva buenas ideas.", "Lisez, surlignez et gardez vos idées.", "Lesen, markieren und gute Ideen bewahren.", "읽고, 강조하고, 좋은 생각을 남기세요.", "Leia, destaque e guarde boas ideias."],
  "about.version": ["当前版本", "Version", "Версия", "バージョン", "Versión", "Version", "Version", "버전", "Versão"],
  "about.changelog": ["更新日志", "Changelog", "Изменения", "更新履歴", "Novedades", "Nouveautés", "Änderungen", "업데이트 내역", "Novidades"],
  "about.guide": ["使用说明", "Guide", "Руководство", "使い方", "Guía", "Guide", "Anleitung", "사용 안내", "Guia"],
  "about.feedback": ["反馈问题", "Report an issue", "Сообщить о проблеме", "問題を報告", "Informar de un problema", "Signaler un problème", "Problem melden", "문제 신고", "Relatar um problema"],
  "about.support": ["支持乔木", "Support the author", "Поддержать автора", "作者を応援", "Apoya al autor", "Soutenir l’auteur", "Autor unterstützen", "개발자 응원", "Apoie o autor"],
  "about.support-description": ["觉得好用，就关注一下或请我喝杯咖啡。", "If it helps you, follow along or buy me a coffee.", "Если плагин полезен, подпишитесь или угостите меня кофе.", "気に入ったら、フォローやコーヒーで応援してください。", "Si te resulta útil, sígueme o invítame a un café.", "S’il vous est utile, suivez-moi ou offrez-moi un café.", "Wenn es hilft, folge mir oder spendiere mir einen Kaffee.", "유용했다면 팔로우하거나 커피 한 잔으로 응원해 주세요.", "Se for útil, acompanhe ou me ofereça um café."],
  "about.follow": ["关注公众号", "Follow on WeChat", "Подписаться в WeChat", "WeChatをフォロー", "Sígueme en WeChat", "Suivre sur WeChat", "Auf WeChat folgen", "위챗 공식 계정 팔로우", "Siga no WeChat"],
  "about.follow-hint": ["微信搜索「向阳乔木推荐看」", "Search “向阳乔木推荐看” in WeChat", "Найдите «向阳乔木推荐看» в WeChat", "WeChatで「向阳乔木推荐看」を検索", "Busca «向阳乔木推荐看» en WeChat", "Recherchez « 向阳乔木推荐看 » sur WeChat", "Suche in WeChat nach „向阳乔木推荐看“", "위챗에서 ‘向阳乔木推荐看’ 검색", "Busque “向阳乔木推荐看” no WeChat"],
  "about.follow-alt": ["向阳乔木推荐看公众号二维码", "QR code for the 向阳乔木推荐看 WeChat account", "QR-код WeChat-аккаунта 向阳乔木推荐看", "向阳乔木推荐看のWeChat QRコード", "Código QR de WeChat de 向阳乔木推荐看", "Code QR WeChat de 向阳乔木推荐看", "WeChat-QR-Code für 向阳乔木推荐看", "向阳乔木推荐看 위챗 계정 QR 코드", "Código QR do WeChat de 向阳乔木推荐看"],
  "about.tip": ["请我喝杯咖啡", "Buy me a coffee", "Угостить кофе", "コーヒーを贈る", "Invítame a un café", "Offrir un café", "Einen Kaffee spendieren", "커피 한 잔 후원", "Ofereça um café"],
  "about.tip-hint": ["微信扫码，支持持续更新", "Scan with WeChat to support updates", "Сканируйте в WeChat, чтобы поддержать обновления", "WeChatでスキャンして更新を応援", "Escanea con WeChat para apoyar las actualizaciones", "Scannez avec WeChat pour soutenir les mises à jour", "Mit WeChat scannen und Updates unterstützen", "위챗으로 스캔하여 업데이트 후원", "Escaneie com WeChat para apoiar as atualizações"],
  "about.tip-alt": ["向阳乔木打赏码", "Tip code for 向阳乔木", "Код поддержки 向阳乔木", "向阳乔木への応援コード", "Código de apoyo a 向阳乔木", "Code de soutien à 向阳乔木", "Spendencode für 向阳乔木", "向阳乔木 후원 코드", "Código de apoio a 向阳乔木"],
  "about.blog": ["博客", "Blog", "Блог", "ブログ", "Blog", "Blog", "Blog", "블로그", "Blog"],
  "about.email": ["邮箱", "Email", "Почта", "メール", "Correo", "E-mail", "E-Mail", "이메일", "E-mail"],
  "about.credit": ["由向阳乔木维护 · GPL-3.0 开源许可", "Maintained by 向阳乔木 · GPL-3.0", "Разработчик: 向阳乔木 · GPL-3.0", "向阳乔木がメンテナンス · GPL-3.0", "Mantenido por 向阳乔木 · GPL-3.0", "Maintenu par 向阳乔木 · GPL-3.0", "Gepflegt von 向阳乔木 · GPL-3.0", "向阳乔木 유지 관리 · GPL-3.0", "Mantido por 向阳乔木 · GPL-3.0"],
  "about.update": ["重新设计关于页，加入公众号和打赏二维码，离线也可查看。", "Redesigned About with offline WeChat and support codes.", "Новая страница «О плагине» с офлайн-кодами WeChat и поддержки.", "情報ページを一新。WeChatと応援コードはオフラインでも表示。", "Página Acerca de renovada con códigos de WeChat y apoyo sin conexión.", "Page À propos repensée avec codes WeChat et de soutien hors ligne.", "Neue Infoseite mit offline verfügbaren WeChat- und Spendencodes.", "정보 페이지 개편: 위챗 및 후원 코드를 오프라인에서도 확인하세요.", "Página Sobre renovada com códigos de WeChat e apoio disponíveis offline."],
};
export const ABOUT_TEXT = Object.fromEntries(languages.map((language, index) => [
  language, Object.fromEntries(Object.entries(messages).map(([key, values]) => [key, values[index]])),
]));
