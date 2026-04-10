import fs from 'fs';
import path from 'path';
import { connectDB, closeDB } from '../config/mongodb';
import { WordList } from '../api/lists/model';
import { Word } from '../api/words/model';
import { persistLearningSnapshot } from '../services/repoLearningSnapshot';
import { assertMeaningEncoding, isLikelyCorruptedMeaning } from '../utils/meaningEncoding';

const TARGET_LIST_NAME = '私教学习自用';

const manualMeaningByValue: Record<string, string> = {
  caliente: '热的/性感的（指物体温度高；形容人时可指性感）（hot / sexy）',
  pasar: '经过/发生/度过（时间）（to pass / happen / spend time）',
  pensar: '想/思考/打算（to think / plan）',
  esperar: '等待/希望/期待（to wait / hope / expect）',
  'por medio de': '通过/借助/经由（by means of / through）',
  este: '东/这个（East / this）',
  extranjero: '外国人（foreigner）',
  baile: '舞蹈/舞会（dance / dance party）',
  novio: '男朋友/新郎（boyfriend / groom）',
  empresa: '公司/企业（company / business）',
  iglesia: '教堂（church）',
  convento: '女修道院/修道院（convent / monastery）',
  'foto / fotograf?a': '照片（photo / photograph）',
  familiares: '亲戚/家人（relatives / family members）',
  familia: '家庭/家人（family）',
  'limpio/limpia': '干净的（clean）',
  usando: '正在使用/用着（using）',
  novia: '女朋友/新娘（girlfriend / bride）',
  'hasta ahora': '直到现在/到目前为止（until now / so far）',
  'todav?a': '还/仍然（still / yet）',
  casado: '已婚的（男性）（married, male）',
  casada: '已婚的（女性）（married, female）',
  'hace calor': '天气热（it is hot）',
  'tengo calor': '我觉得热/我很热（I feel hot）',
  caluroso: '炎热的/很热的（hot / warm）',
  'templado / c?lido': '温和的/温暖的（temperate / mild / warm）',
  mundo: '世界（world）',
  'conocida como': '被称为/以……著称（known as）',
  'que se llama': '叫作/名为（called / named）',
  'am?rica': '美洲（America, the continent）',
  'estados unidos': '美国（United States）',
  vocabulario: '词汇/词汇量（vocabulary）',
  palabra: '单词/词语（word）',
  bella: '美丽的（beautiful）',
  introducir: '介绍/引入（to introduce）',
  '?ltimo': '最后的/最近的（last）',
  'gente mayor': '老年人/年长者（elderly people / older people）',
  pregunta: '问题/提问（question）',
  respuesta: '回答/答案（answer）',
  'rec?mara': '卧室（墨西哥常用）（bedroom, mainly Mexico）',
  'adentro/dentro': '里面/在里面（inside）',
  'afuera/fuera': '外面/在外面（outside）',
  'abrir (abren)': '打开（to open）',
  contables: '可数的/会计人员（countable / accountants）',
  'fuegos artificiales': '烟花（fireworks）',
  llevar: '带/携带（to carry / take）',
  'cumplea?os': '生日（birthday）',
  maestra: '女老师（female teacher）',
  'perd?n': '对不起/请原谅（sorry / pardon me）',
  'confund?': '我搞混了/我弄错了（I got confused）',
  universidad: '大学（university）',
  museos: '博物馆（museums）',
  paisajes: '风景/景观（landscapes）',
  equivalente: '等价的/对应的（equivalent）',
  vencimient: '到期/截止日期（expiration / due date）',
  visa: '签证（visa）',
  maestro: '老师/大师（teacher / master）',
  entrada: '入口/门票/前菜（entrance / ticket / starter）',
  asistir: '出席/协助（to attend / assist）'
};

const repairedValueByValue: Record<string, string> = {
  'foto / fotograf?a': 'foto / fotografía',
  'todav?a': 'todavía',
  'templado / c?lido': 'templado / cálido',
  'am?rica': 'américa',
  '?ltimo': 'último',
  'rec?mara': 'recámara',
  'cumplea?os': 'cumpleaños',
  'perd?n': 'perdón',
  'confund?': 'confundí',
  vencimient: 'vencimiento'
};

const translationPath = path.resolve(process.cwd(), 'data', 'imports', 'spanish-vocabulary', 'zh-translations.json');
const translationMap = JSON.parse(fs.readFileSync(translationPath, 'utf8')) as Record<string, string>;

const extractEnglishGloss = (meaning: string) =>
  meaning
    .replaceAll('�', '?')
    .replaceAll('?', ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[-/;,.:()\s]+|[-/;,.:()\s]+$/g, '')
    .trim();

const tokenize = (value: string) =>
  new Set(
    value
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter(Boolean)
  );

const scoreEnglishOverlap = (badEnglish: string, candidateMeaning: string) => {
  const parenthetical = candidateMeaning.match(/（(.+?)）/);
  if (!parenthetical) {
    return 0;
  }

  const a = tokenize(badEnglish);
  const b = tokenize(parenthetical[1]);
  let score = 0;
  for (const token of a) {
    if (b.has(token)) {
      score += 1;
    }
  }
  return score;
};

const formatMeaning = (chinese: string, english: string) => `${chinese}（${english}）`;

const resolveMeaning = (value: string, badMeaning: string, otherMeanings: string[]) => {
  const manualMeaning = manualMeaningByValue[value];
  if (manualMeaning) {
    return manualMeaning;
  }

  const englishGloss = extractEnglishGloss(badMeaning);
  const translated = translationMap[englishGloss];
  if (translated) {
    return formatMeaning(translated, englishGloss);
  }

  const rankedOtherMeanings = otherMeanings
    .map((meaning) => ({
      meaning,
      score: scoreEnglishOverlap(englishGloss, meaning)
    }))
    .sort((a, b) => b.score - a.score);

  if (rankedOtherMeanings[0]?.score > 0) {
    return rankedOtherMeanings[0].meaning;
  }

  if (otherMeanings.length === 1) {
    return otherMeanings[0];
  }

  throw new Error(`No repair strategy for word "${value}" with meaning "${badMeaning}"`);
};

const run = async () => {
  await connectDB(1, 100);

  try {
    const list = await WordList.findOne({ name: TARGET_LIST_NAME });
    if (!list) {
      throw new Error(`List "${TARGET_LIST_NAME}" not found`);
    }

    const words = await Word.find({ 'ownedByLists.listId': list._id });
    let repairedMeanings = 0;
    let repairedValues = 0;
    let mergedWords = 0;

    for (const word of words) {
      const context = word.ownedByLists.find((item) => item.listId.toString() === list._id.toString());
      if (!context) {
        continue;
      }

      const originalValue = word.value;
      const nextValue = repairedValueByValue[originalValue] || originalValue;
      const finalMeaning = isLikelyCorruptedMeaning(context.meaning)
        ? resolveMeaning(
            originalValue,
            context.meaning,
            word.ownedByLists
              .filter((item) => item.listId.toString() !== list._id.toString())
              .map((item) => item.meaning)
              .filter((meaning) => !isLikelyCorruptedMeaning(meaning))
          )
        : context.meaning;

      assertMeaningEncoding(finalMeaning);

      let changed = false;

      if (isLikelyCorruptedMeaning(context.meaning)) {
        context.meaning = finalMeaning;
        repairedMeanings += 1;
        changed = true;
      }

      if (nextValue !== originalValue) {
        const duplicate = await Word.findOne({ value: nextValue, _id: { $ne: word._id } });
        if (duplicate) {
          const duplicateContext = duplicate.ownedByLists.find((item) => item.listId.toString() === list._id.toString());
          if (duplicateContext) {
            duplicateContext.meaning = finalMeaning;
          } else {
            duplicate.ownedByLists.push({
              listId: list._id,
              meaning: finalMeaning,
              learnedPoint: context.learnedPoint || 0
            });
          }
          await duplicate.save();

          word.ownedByLists = word.ownedByLists.filter((item) => item.listId.toString() !== list._id.toString());
          if (word.ownedByLists.length === 0) {
            await Word.findByIdAndDelete(word._id);
          } else {
            await word.save();
          }

          repairedValues += 1;
          mergedWords += 1;
          continue;
        }

        word.value = nextValue;
        repairedValues += 1;
        changed = true;
      }

      if (changed) {
        await word.save();
      }
    }

    await WordList.findByIdAndUpdate(list._id, { updated_at: new Date() });
    await persistLearningSnapshot();

    const remainingCorrupted = await Word.countDocuments({
      ownedByLists: {
        $elemMatch: {
          listId: list._id,
          meaning: /[?�]/
        }
      }
    });

    console.log(
      JSON.stringify(
        {
          listId: list._id.toString(),
          listName: list.name,
          repairedMeanings,
          repairedValues,
          mergedWords,
          remainingCorrupted
        },
        null,
        2
      )
    );
  } finally {
    await closeDB();
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
