const { Client } = require("@notionhq/client");
const Parser = require("rss-parser");

// 1. 환경변수 및 설정
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;
const parser = new Parser();


const RSS_LIST = [
  "https://techblog.woowahan.com/feed/",
  "https://d2.naver.com/d2.xml",
  "https://toss.tech/rss.xml",
  "https://feeds.feedburner.com/geeknews-feed"
];


async function getDatabaseTags() {
  const database = await notion.databases.retrieve({ database_id: DATABASE_ID });
  return database.properties.Tags.multi_select.options.map((o) => o.name);
}

async function main() {
  console.log("🔄 RSS 가져오기 시작...");
  
  for (const url of RSS_LIST) {
    try {
      const feed = await parser.parseURL(url);
      console.log(`\n📡 [${feed.title}] 처리 중...`);

      for (const item of feed.items) {
        // 제목과 링크가 없으면 스킵
        if (!item.title || !item.link) continue;

        // 2. 중복 검사 (같은 제목의 글이 이미 있는지 확인)
        const exists = await notion.databases.query({
          database_id: DATABASE_ID,
          filter: {
            property: "Name", // morethan-log의 제목 속성 이름은 보통 'Name'입니다.
            title: {
              equals: item.title,
            },
          },
        });

        if (exists.results.length > 0) {
          // 이미 있으면 건너뜀
          continue; 
        }

        // 3. 새 글 추가 (Post 타입, Published 상태)
        await notion.pages.create({
          parent: { database_id: DATABASE_ID },
          properties: {
            Name: { // 제목
              title: [{ text: { content: item.title } }],
            },
            Date: { // 날짜
              date: { start: new Date(item.pubDate || new Date()).toISOString() },
            },
            Slug: { // URL 주소 (제목을 하이픈으로 연결)
              rich_text: [{ text: { content: item.title.replace(/[^a-z0-9]/gi, '-').toLowerCase() } }],
            },
            Type: { // 게시글 타입
              select: { name: "Post" },
            },
            Status: { // 게시글 상태
              select: { name: "Published" },
            },
            Category: { // 카테고리 (RSS Feed로 지정)
              select: { name: "RSS Feed" },
            },
            Tags: { // 태그
              multi_select: [{ name: "Tech News" }], 
            },
          },
          // 본문에는 원본 링크를 넣어줍니다.
          children: [
            {
              object: "block",
              type: "paragraph",
              paragraph: {
                rich_text: [
                  { text: { content: "Original Link: " } },
                  {
                    text: { content: item.link, link: { url: item.link } },
                  },
                ],
              },
            },
            {
              object: "block",
              type: "embed", // 미리보기 임베드 시도
              embed: { url: item.link },
            },
          ],
        });
        console.log(`✅ 추가됨: ${item.title}`);
      }
    } catch (error) {
      console.error(`❌ 에러 발생 (${url}):`, error.message);
    }
  }
  console.log("\n✨ 모든 작업 완료!");
}

main();