import json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
PAGES=json.loads((ROOT/'content/source-pages.json').read_text(encoding='utf-8'))
ESSAYS=[]
def essay(i,title,question,qzh,starts,translations,kind,stance,structures,notes):
    raw=PAGES[i]
    text=re.sub(r'\s+\d+\s*$','',raw).replace('quick-\nwitted','quick-witted').replace('well-\ninformed','well-informed').replace('problem-\nsolving','problem-solving').replace('ofjobs','of jobs')
    text=' '.join(text.split())
    positions=[text.index(x) for x in starts]+[len(text)]
    paras=[text[positions[j]:positions[j+1]].strip() for j in range(len(starts))]
    assert len(paras)==len(translations)==len(structures),(i,len(paras),len(translations),len(structures))
    ns=[]
    for p,c,q,t,e in notes:
        assert q in paras[p],(i,p,q)
        ns.append(dict(p=p,c=c,q=q,t=t,e=e))
    ESSAYS.append(dict(id=f'essay-{i:02}',title=title,question=question,qzh=qzh,paragraphs=paras,translations=translations,kind=kind,stance=stance,structure=[dict(title=s.split('｜')[0],role='',points=s.split('｜')[1:]) for s in structures],readerNotes=ns,sourcePage=i+1))

essay(2,'高层管理者与普通员工薪资差距','Some people think it is a good thing for senior management positions to have very high salaries compared to other workers of the same company or organisation.\nTo what extent do you agree?','有人认为，同一公司或机构的高层管理者薪资远高于普通员工是好事。你在多大程度上同意？',
['The debate','Senior management roles','However, large pay','Furthermore, allocating','In conclusion,'],[
'高层管理者是否应该比其他员工获得高得多的薪资，一直存在争论。有些人认为，这些岗位的责任和影响力足以证明高薪合理，另一些人则认为过大的薪酬差距会损害组织。我认为，高层管理者虽然应获得更高报酬，但过大的工资差异会造成损害，甚至削弱组织的长期成功。',
'高层管理岗位承担着直接影响公司成败的重大责任。这些岗位通常要求丰富的经验和高级技能，因此有理由提供更高薪资来吸引和留住顶尖人才。例如，首席执行官的决策可以决定一家跨国公司的兴衰，所以支付更高薪酬来获得最佳领导人才是合理且必要的。',
'然而，高层与普通员工之间过大的薪酬差距会引起不公平感和怨恨。这可能降低士气与生产效率，因为觉得自己未被重视的员工可能缺乏做好工作的动力。当员工看到只有高层显著受益时，他们可能更不愿尽最大努力，导致工作环境缺乏投入、效率下降。',
'此外，把过多资金分配给高层薪酬，会减少可用于员工发展和福利的资源。重视公平薪酬的组织更可能培养出忠诚且积极的员工队伍，形成更加合作、投入的环境。重视资源公平分配能确保所有员工感到被重视，从而提升组织整体表现。',
'总之，高层管理者因其岗位职责理应获得较高薪资，但应避免过大的薪酬差距。合理的薪酬结构能形成更积极、更高效的员工队伍，最终使整个组织受益并保障长期成功。'],
'同意与否','有条件同意高薪，反对过大差距。',[
'引言｜呈现争议｜区分合理高薪与过大差距。','主体一｜1 个支持理由：责任与能力要求高｜经验和技能要求 → 吸引留住人才 → CEO 决策例子。','主体二｜1 个反对理由：公平感和动力受损｜工资差距 → 怨恨 → 士气与效率下降。','主体三｜1 个资源分配理由｜高层占用预算 → 员工发展福利减少；公平分配则提升投入。','结论｜重申合理高薪、避免极端差距｜回扣员工动力与组织表现。'],[
(0,'vocab','compensation','compensation n.','此处为薪酬、报酬，不是事故后的赔偿。'),(0,'vocab','detrimental','detrimental adj.','有害的；常用 be detrimental to。'),(1,'vocab','substantial','substantial adj.','重大的、数量可观的。'),(2,'vocab','resentment','resentment n.','因不公产生的怨恨、不满。'),(2,'vocab','morale','morale n.','团队士气，区别于 moral（道德的）。'),(3,'vocab','equitable','equitable adj.','公平合理的，不一定意味着每人相同。'),
(0,'syntax','while senior management deserves higher compensation','while 引导让步从句','在 I believe that 后嵌入让步：虽然高层应多得，但差距不宜过大。'),(1,'syntax','making higher pay reasonable and necessary','making + 宾语 + 形容词','现在分词交代结果；reasonable 和 necessary 作宾语补足语。'),(3,'syntax','are likely to foster','be likely to do','表示可能产生的结果，不把因果说成绝对。'),(2,'link','However','转折','由高薪合理性转向过大差距的危害。'),(3,'link','Furthermore','递进','从员工心理扩展到资源分配。'),(2,'link','as employees who feel undervalued','as：原因','解释士气下降的原因；who 从句修饰 employees。'),
(1,'expression','attract and retain top talent','attract / retain talent','吸引并留住顶尖人才，两个并列动词。'),(0,'expression','pay gaps','pay gaps / pay differences','本文表示薪资差距的近义替换。'),(3,'expression','loyal and motivated workforce','loyal / motivated / committed','忠诚、有动力、投入的；适合描述员工品质。')])

essay(3,'领导的重要品质','Intelligence is the most important factor for a leader.\nTo what extent do you agree or disagree?','智力是领导者最重要的因素。你在多大程度上同意或不同意？',['Leadership skills','The main argument','Another reason why','In conclusion,'],[
'领导能力包含多种品质，但人们常认为领导者最主要的品质是智力。基于几个理由，我完全同意这一观点。',
'支持这一观点的主要理由是，领导岗位上的人必须能引导团队走上正确道路。这要求一个人反应敏捷、聪明，因为他们必须分析和处理大量信息。此外，领导者不仅要仔细思考策略，还必须得出明确结论，因为通常有多种选择需要考虑。而且，领导者通常承担不起犯错的后果，因此必须仔细审查每个细节及可能结果，以确保成功。因此，他们的工作成效在很大程度上取决于智力。',
'智力至关重要的另一个理由是，它帮助领导者有效解决弱点。毫无疑问，领导者必须帮助团队成员发现弱项并找到改进办法，因为尽量减少弱点对取得进步至关重要。在处理需要不同分析方法的特殊问题时，这一点尤其有用。这也有益于领导者本人，因为他们同样并非没有缺点。他们需要更精准地处理自己的弱点。不过，聪明的领导者通常了解自身不足，并能采取适当行动克服它们，最终使领导者和团队双方受益。',
'总之，我认为智力是领导者的关键因素，因为它为团队成功提供了两项重要优势：有效引导团队的能力，以及高效处理弱点的能力。'],
'同意与否','完全同意；但正文主要证明“重要”，与“最重要”的比较论证不足。',[
'引言｜改写题目并明确完全同意。','主体一｜1 个核心论点：指导方向｜处理信息 → 比较策略 → 检查风险 → 有效决策。','主体二｜1 个核心论点：识别并克服弱点｜先谈团队成员，再谈领导者自身。','结论｜汇总指导团队、处理弱点两点｜注意原题是最高级 most important。'],[
(1,'vocab','quick-witted','quick-witted adj.','思维敏捷的、反应快的。'),(1,'vocab','scrutinize','scrutinize v.','仔细检查、审视，比 look at 更强调细致。'),(2,'vocab','immune to flaws','immune / flaws','immune to：不受影响；flaws：缺陷。这里说领导者也会有缺点。'),(2,'vocab','precision','precision n.','精确、准确。'),(2,'vocab','shortcomings','shortcomings n.','不足、缺点。'),
(1,'syntax','it is vital for someone in a leadership position to be able to guide','It is + adj. + for sb + to do','it 为形式主语，不定式是真正主语；说明领导者需要具备的能力。'),(2,'syntax','Another reason why intelligence is crucial is that','Another reason why … is that …','why 从句限定 reason；that 从句说明具体理由。'),(1,'link','since leaders generally cannot afford to make mistakes','since：原因','解释为什么必须仔细检查；此处不是“自从”。'),(1,'link','As a result','结果','把前面的决策要求归结为成效依赖智力。'),(2,'link','However','转折','从领导者也有弱点，转向聪明领导者能够发现并改进。'),
(2,'expression','weak points','weak points / weaknesses / shortcomings','本文表示弱点的相关替换；flaws 语气可更强。'),(1,'expression','guide a team along the right path','guide a team','引导团队；适合领导与协作话题。'),(2,'expression','take appropriate actions','take appropriate actions','采取适当行动；appropriate 修饰行动是否合乎情境。')])

essay(4,'公司提供运动和社交设施','All large companies should provide sports and social facilities for the local community.\nTo what extent do you agree or disagree with this statement?','所有大公司都应该为当地社区提供体育和社交设施。你在多大程度上同意或不同意？',['In recent years,','On the one hand,','On the other hand,','In conclusion,'],[
'近年来，关于大公司是否应负责为当地社区提供体育和社交设施，讨论日益增多。虽然我同意企业能在支持社会方面发挥积极作用，但我不认为这应被视为所有大企业的义务。',
'一方面，鼓励公司以这种方式作出贡献有充分理由。首先，体育和社交设施能通过促进健康生活方式和更多社会互动，改善当地居民的福祉。例如，公司建设的健身房或社区中心能够减少肥胖等健康问题，也能提供建立更紧密联系的空间。其次，公司也会从此类投资中间接受益。支持社区能改善企业声誉、建立顾客忠诚度，甚至提高员工满意度，因为员工往往更喜欢有强烈社会责任感的公司。',
'另一方面，强制所有大公司这样做可能带来不公平的负担。企业存在的主要目的是创造利润、提供就业和缴纳税款。迫使它们建设设施可能分散核心业务精力，或削弱竞争力，尤其是在运营成本较高的行业。此外，提供社区设施仍应是政府的责任，因为政府征税，也更有条件在不同地区和社会群体之间公平配置资源。',
'总之，我认为公司通过建设体育和社交设施来支持当地社区非常有益，但不应将其视为所有大企业的义务。相反，政府应承担主要责任，而企业应受到鼓励而非被迫作出贡献。'],
'同意与否','支持企业自愿贡献，反对对所有大公司一概强制。',[
'引言｜区分积极作用与强制义务。','主体一｜2 点收益：社区健康与互动；企业声誉、忠诚度和满意度｜每点都有解释或例子。','主体二｜2 点反对：企业负担；政府更适合公平分配资源。','结论｜政府主责、企业自愿参与。'],[
(0,'vocab','obligation','obligation n.','义务、必须履行的责任。'),(1,'vocab','well-being','well-being n.','身心健康、福祉，不只指收入。'),(2,'vocab','compulsory','compulsory adj.','强制的、必须的。'),(2,'vocab','competitiveness','competitiveness n.','竞争力。'),(2,'vocab','allocate','allocate v.','分配资源、资金等。'),
(0,'syntax','it should be considered an obligation','be considered + 名词','被视作某事；这里把是否履行义务作为争论核心。'),(2,'syntax','making it compulsory for all large companies may create','动名词短语作主语','making … companies 作整体主语；may 表示可能性。'),(2,'syntax','are better placed to allocate','be better placed to do','更有条件、更适合做某事。'),
(0,'link','While I agree','While：让步','承认企业贡献的好处，但反对普遍强制。'),(1,'link','First','First / Second：分点','明确标示社区受益与企业受益两个论点。'),(2,'link','Moreover','递进','从企业成本扩展到政府职责。'),
(1,'expression','enhance their reputation, build customer loyalty','enhance / build','提升声誉、建立顾客忠诚度，注意各自动宾搭配。'),(3,'expression','encouraged, but not forced','encouraged / forced','用对比精确表达自愿与强制的立场。'),(0,'expression','corporations','corporations / companies / businesses','本文用于公司、企业的替换；不是所有场景完全等价。')])

essay(5,'交通拥堵税','In some cities, governments have tried to reduce traffic congestion. For instance, they have imposed a congestion tax during rush hour.\nDo you think this development is positive or negative?','一些城市的政府试图缓解交通拥堵，例如在高峰期征收拥堵税。你认为这是积极还是消极的发展？',['In many cities,','One key benefit','Another important advantage','In conclusion,'],[
'许多城市的政府在交通高峰时段征收拥堵费，以努力减轻拥堵。我坚信，这项政策是一种积极发展，因为它有助于缓解环境问题，并鼓励更可持续的交通选择。',
'拥堵费的一个主要好处，是能减少道路上的私家车数量。提高高峰期驾车成本会抑制不必要的汽车出行，从而降低车流量。因此，空气污染和噪声污染显著减少，改善人口密集城市地区的整体环境质量。这对大城市尤其重要，因为过度使用汽车是拥堵的主要原因之一。',
'另一个重要优点是对通勤者福祉的积极影响。严重拥堵经常导致出行时间延长，带来压力、挫败感和精神疲劳。拥堵费通过疏通车流，让日常出行更可预期、没那么疲惫。此外，收费产生的收入可用于改善公共交通，例如扩展公交和地铁服务。这会进一步鼓励人们放弃私家车，形成更高效、更均衡的交通网络。',
'总之，我坚信高峰期征收拥堵费是积极的一步。该政策不仅减少污染和交通压力，也支持更好的公共交通发展。长远来看，拥堵收费能够帮助城市变得更清洁、更安静、更宜居。'],
'积极／消极发展','明确认为积极，论证环境与通勤两类收益。',[
'引言｜改写政策并表明积极立场。','主体一｜1 条主链：收费 → 减少不必要驾车 → 车流和污染下降。','主体二｜2 项相关收益：减轻通勤压力；收费收入投入公交形成进一步改善。','结论｜重申两类收益与长期结果。'],[
(0,'vocab','alleviate','alleviate v.','缓解痛苦、压力、问题。'),(1,'vocab','densely populated','densely populated','人口密集的；densely 为副词。'),(2,'vocab','commuters','commuters n.','通勤者。'),(2,'vocab','fatigue','fatigue n.','疲劳，mental fatigue 指精神疲劳。'),(2,'vocab','revenue','revenue n.','收入，本文为收费所得。'),
(3,'syntax','Not only does this policy reduce','Not only 前置倒装','Not only 放句首，助动词 does 前置；后接 but it also supports …。'),(2,'syntax','revenue generated from these charges','过去分词后置修饰','generated … 修饰 revenue，相当于收入“由收费产生”。'),(1,'syntax','By increasing the cost of driving','By + doing 的主语问题','后接被动句 unnecessary car journeys are discouraged，逻辑执行者不一致；改为 governments can discourage … 更清楚。'),
(0,'link','in an effort to','目的短语','表示采取收费措施是为了缓解拥堵。'),(1,'link','As a result','结果','承接车流减少，推出污染下降。'),(2,'link','In addition','补充','从通勤体验补充资金用途。'),
(0,'expression','peak hours','peak hours / rush hours','交通高峰时段的近义替换。'),(2,'expression','easing traffic flow','ease traffic flow','缓解交通压力；也可说 improve traffic flow。'),(3,'expression','more livable','livable adj.','宜居的，用于城市话题。')])

essay(6,'远程工作对雇主无益','Many employees can now do their work from home using modern technology. However, this change may only benefit workers, not the employers.\nTo what extent do you agree or disagree?','许多员工现在可借助现代科技在家工作。然而，这种变化可能只对员工有利，对雇主无益。你在多大程度上同意或不同意？',['Many employees','One major reason','Another significant benefit','Despite some potential','In conclusion,'],[
'许多员工如今能够借助现代科技在家工作。不过，有人认为这种发展只让员工而非雇主受益。我大体同意这一观点，因为员工获得的好处更直接、更显著，而雇主的收益相对有限且有条件。',
'远程工作主要让员工受益的一个重要原因，是它提供的灵活性。在家工作使个人能更自由地安排工作时间，更好地平衡职业责任和个人需要。这种灵活性带来更高的工作满意度和更低的压力，是员工直接且个人化的收益。例如，员工可以调整时间表履行家庭责任，同时不损害工作表现，而这在传统办公室环境中更难做到。',
'员工的另一个显著收益是工作与生活更平衡。省去漫长通勤后，员工可以花更多时间陪伴家人，并保持更好的心理健康。这不仅改善整体生活质量，也有助于预防职业倦怠和长期压力等问题。从雇主角度看，远程工作可能减少办公空间和水电等运营成本。然而，这些节省往往不稳定，可能被数字基础设施和远程管理系统的投入抵消。',
'尽管雇主可能获得一些好处，管理远程员工队伍仍然很有挑战。监督员工表现、确保协作、维持生产效率可能存在困难，尤其在大型组织中。员工每天得到切实好处，与之不同，雇主必须高度依靠有效监督和技术，才能获得可比的结果。因此，雇主可能获得间接或短期收益，员工则从远程工作中享有更清楚、更稳定的好处。',
'总之，虽然在家工作可以给雇主带来一定收益，但这些收益通常有限，而且高度取决于管理质量和技术。相比之下，员工得到的好处更直接、更可靠，尤其体现在灵活性及工作生活平衡上。'],
'同意与否','原题是“只让员工受益”；范文实际论证“员工收益更多”，承认雇主受益后应明确部分同意而非偷换范围。',[
'引言｜对比员工直接收益与雇主有条件收益。','主体一｜灵活性 → 安排家庭责任 → 满意度提高。','主体二｜通勤减少 → 生活平衡；同时承认雇主节约成本但有抵消因素。','主体三｜雇主管理成本与困难｜与员工日常可感知的收益对照。','结论｜强调收益程度的差异，而非完全没有收益。'],[
(0,'vocab','conditional','conditional adj.','有条件的，取决于某些前提。'),(2,'vocab','burnout','burnout n.','长期工作压力造成的身心倦怠。'),(2,'vocab','utilities','utilities n.','水、电等公用服务。'),(2,'vocab','offset','offset v.','抵消；这里节省被新增投入抵消。'),(3,'vocab','tangible','tangible adj.','切实可感知的。'),(3,'vocab','supervision','supervision n.','监督、管理。'),
(1,'syntax','allows individuals to arrange','allow sb to do','允许／使某人能够做某事；后面 arrange 与 balance 并列。'),(1,'syntax','without compromising their work performance','without + doing','在不损害工作表现的前提下。'),(3,'syntax','Monitoring employee performance, ensuring collaboration and maintaining productivity','并列动名词作主语','三个管理任务并列，后接 can be problematic。'),
(2,'link','From the employers’ perspective','转换观察角度','从员工好处切换到雇主成本。'),(3,'link','Unlike employees','Unlike + 名词：对比','unlike 是介词；说明雇主获得收益的方式不同。'),(4,'link','In contrast','对照','与雇主有限、有条件的收益对照。'),
(1,'expression','job satisfaction','job satisfaction','工作满意度，常用就业话题名词。'),(2,'expression','work-life balance','work-life balance','工作与生活的平衡。'),(2,'expression','operational costs','operational costs','运营成本；具体例子为办公空间和水电。')])

essay(7,'极限运动','Extreme sports such as skydiving and skiing are very dangerous and should be banned.\nTo what extent do you agree or disagree with this view?','跳伞、滑雪等极限运动非常危险，应该禁止。你在多大程度上同意或不同意？',['Nowadays, extreme','On one hand,','Nevertheless, even','In conclusion,'],[
'如今，极限运动在世界各地越来越受欢迎，各类极限运动比赛为参与者带来刺激与冒险。虽然有些人支持取缔这些危险运动，但我认为每个人都应有参加极限运动的自由。',
'一方面，漂流、赛车、踢拳、跳伞等极限运动确实具有内在风险。缺乏经验的人可能鲁莽且准备不足，增加危及生命的受伤风险。即使技术娴熟、经验丰富的运动员，也可能因小错误而严重受伤甚至丧生。例如，范文称著名滑雪板运动员 Caleb Moore 在比赛中驾驶雪地摩托尝试后空翻，却发生猛烈撞击，最终死于伤势引起的并发症。这类事故不仅对参赛者造成沉重打击，对他们的朋友、家人和忠实粉丝也一样。',
'不过，即便极限运动有风险，人们仍应有按意愿参与的自由。极限运动选手通常享受这些活动固有的挑战、刺激和肾上腺素激增感，许多人也充分了解并接受风险。此外，极限运动往往给选手带来荣耀、名望，甚至为国家赢得认可。由于这些运动比其他运动更有挑战、要求更高技术，选手通常会为自己的成就感到自豪。政府不应完全禁止极限运动，而应确保设施符合所要求的法定安全标准，所有参赛者也采取必要的预防措施。',
'总之，我认为，尽管存在风险，人们仍应有参加极限运动的自由，因为它为许多人带来极大的刺激和冒险体验。'],
'同意与否','承认危险，但反对禁令；提倡安全监管。文中人物身份与事故细节未提供来源，不宜直接背成事实论据。',[
'引言｜承认争议，表明参与自由。','主体一｜让步：风险无法完全消除｜经验不足和经验丰富者均可能受伤，再举事故例子。','主体二｜自由与个人价值；荣誉和成就｜最后提出监管替代禁令。','结论｜重申自由及体验价值。'],[
(0,'vocab','outlawing','outlaw v.','宣布非法、禁止。'),(1,'vocab','inherently','inherently adv.','内在地、固有地。'),(1,'vocab','reckless','reckless adj.','鲁莽的，不顾风险的。'),(1,'vocab','complications','complications n.','此处为医疗上的并发症。'),(2,'vocab','relish','relish v.','非常享受、喜爱。'),(2,'vocab','prestige','prestige n.','声望、威望。'),
(1,'syntax','end up getting severely injured','end up + doing','最终落得某种结果；getting injured 为被动含义。'),(2,'syntax','ensure that the sports facilities meet','ensure that … and that …','两个 that 从句分别说明设施达标与选手采取预防措施。'),(3,'syntax','because it provides','指代问题','it 与前面的 extreme sports 复数不一致；可改为 these activities provide。'),
(2,'link','Nevertheless','让步转折','承认上一段风险后，坚持不应全面禁止。'),(2,'link','Since extreme sports','Since：原因','说明为什么选手具有成就感。'),(2,'link','Rather than outright banning','rather than：替代方案','从禁止转为监管设施和预防措施。'),
(2,'expression','take the necessary precautions','take precautions','采取预防措施，安全类常用搭配。'),(0,'expression','increasing in popularity','increase in popularity','越来越受欢迎，避免只用 more popular。'),(2,'expression','a sense of pride in their accomplishments','a sense of pride / accomplishments','成就带来的自豪感；品质与动机表达。')])

essay(8,'家用电器','In many countries people can buy a wide range of household goods (for example, TV, microwave ovens and rice cookers).\nIs it a positive or negative development?','许多国家的人们可以买到种类繁多的家用品，例如电视、微波炉和电饭煲。这是积极还是消极的发展？',['In modern society,','To begin with,','Moreover, household','Nevertheless, the rapid','In conclusion,'],[
'现代社会中，越来越多人购买电视、微波炉、电饭煲等各种家用电器。我认为这一趋势利大于弊，不过一些负面后果也不可忽视。',
'首先，这些产品极大提高了日常生活的便利和舒适程度。例如，微波炉和电饭煲缩短做饭时间，对经常难以兼顾职业和家庭责任的上班族尤其有益。同样，洗衣机和吸尘器减少体力劳动，让人们能把时间用于更有意义或更有效率的活动。因此，整体生活质量显著改善。',
'此外，电视和智能音箱等家用设备让人们容易获取信息、知识和娱乐。这不仅开阔眼界，也帮助人们跟上全球事件。在快节奏的世界中，了解信息至关重要，而科技使这一过程比过去高效得多。',
'不过，这些产品的快速消费也产生挑战。电子电器的生产和废弃处置导致环境恶化，尤其是电子垃圾问题。此外，对机器的过度依赖可能减少身体活动，促成久坐生活方式及肥胖等健康问题。',
'总之，虽然存在不可否认的弊端，我仍认为使用家用产品的积极方面超过消极方面。通过更完善的回收体系和更强的健康生活意识，可以在减少危害的同时，把这些设备的益处发挥到最大。'],
'积极／消极发展','总体积极，安排两段优点、一段弊端，再提出减害条件。',[
'引言｜总体利大于弊。','主体一｜便利：缩短家务时间、减轻劳动 → 可重新分配时间。','主体二｜信息与娱乐获取 → 开阔眼界、保持知情。','主体三｜2 点风险：电子垃圾；过度依赖导致少动。','结论｜综合判断并提出回收和健康意识。'],[
(0,'vocab','appliances','appliances n.','家用电器、器具。'),(1,'vocab','allocate','allocate v.','分配，此处为分配时间。'),(3,'vocab','disposal','disposal n.','处理、处置，本文指废弃电器处置。'),(3,'vocab','degradation','degradation n.','恶化、退化。'),(3,'vocab','sedentary','sedentary adj.','久坐的、缺乏活动的。'),
(1,'syntax','the time spent on preparing meals','过去分词修饰名词','spent on … 修饰 time，相当于 time that is spent …。'),(1,'syntax','allowing individuals to allocate','allowing 表示结果','前文减少劳动，后文解释腾出的时间可以怎样使用。'),(4,'syntax','can be maximised while minimising','被动与省略主语','句意可懂，但 while 的动作执行者不明确；用 people can maximise … while minimising … 更平行。'),
(1,'link','Similarly','类比补充','把烹饪电器的例子扩展到清洁电器。'),(3,'link','Nevertheless','转折','由两段优点转入环境与健康风险。'),(4,'link','With stronger recycling systems','With + 名词短语','说明改善结果所依赖的条件。'),
(2,'expression','easy access to','have access to','有机会或条件获取信息；access 是名词。'),(2,'expression','broadens horizons','broaden horizons','开阔眼界，信息与教育类搭配。'),(0,'expression','household appliances','goods / appliances / devices','goods 范围最广；appliances 指电器；devices 强调设备，不是任意互换。')])

essay(9,'文物的归还','Historical objects in museums all over the world should be returned to their country of origin.\nTo what extent do you agree or disagree?','世界各地博物馆中的历史文物应归还原属国。你在多大程度上同意或不同意？',['In recent years,','On the one hand,','On the other hand,','In conclusion,'],[
'近年来，外国博物馆里的历史文物是否应送回原属国成为重大争论。我部分同意这一观点。归还这些物品能尊重历史、建立本地人的自豪感，但把其中一部分留在大型国际博物馆能够保护它们免受损害，也帮助更多人了解不同文化。',
'一方面，归还历史文物对原属国有明显好处。首先，归还古物有助于纠正过去的错误，改善国家间关系。许多珍宝是在过去的战争中被带走的。外国归还它们，体现对当地历史的尊重，有助于弥合旧伤、拉近国家之间的距离。其次，在本国展示本地珍宝会让当地人为自己的文化自豪。这些物品是国家历史的重要象征。当地人能够亲眼看到它们，就更容易了解过去，增强与故土及文化的联系。',
'另一方面，并非所有物品都应立即送回，也有充分理由。其一，长距离运输古老、脆弱的物品容易使其破损。许多古物年代久远，长途旅行或天气和温度变化都可能损坏它们。因此，将它们保存在现代、安全的博物馆中是更好的选择。此外，大型国际博物馆方便人们在同一个地方了解不同文化。大英博物馆等知名场所每年迎接数百万访客。在同一博物馆展示世界各地的物品，让游客同时了解多种文化，使知识传播到全球。',
'总之，我部分同意历史文物应归还原属地。归还能够纠正历史错误，并让当地人自豪。然而，为了保护文物并帮助更多人学习，各国应沟通合作，而不是立即归还一切。'],
'同意与否','部分同意；归还的文化价值与保存、传播价值对照。',[
'引言｜明确部分同意，并预告双方理由。','主体一｜2 点：修复历史关系；强化文化认同。','主体二｜2 点：运输保护风险；跨文化展示价值。','结论｜建议协商而非一概立即归还｜保存能力应按实际情况判断，不能假定外国必然更好。'],[
(1,'vocab','treasures','treasures n.','珍宝、宝贵文物。'),(2,'vocab','ruined','ruin v.','毁坏、严重损害。'),(3,'vocab','rights past wrongs','right v.','熟词生义：纠正。rights past wrongs＝纠正过去的不公。'),
(0,'syntax','whether old historical objects in foreign museums should be sent back','whether 从句作主语','整个“是否应归还”的问题作 has become 的主语。'),(2,'syntax','there are good reasons why','there are reasons why …','why 从句说明理由所对应的判断。'),(2,'syntax','allows tourists to learn','allow sb to do','展示各国文物使游客能了解多元文化。'),
(1,'link','Firstly','Firstly / Secondly','一段内部明确区分两项归还理由。'),(2,'link','For one thing','分点开头','提出运输风险，再用 Furthermore 补充文化传播价值。'),(3,'link','rather than','对比选择','协商合作优于立即全部归还。'),
(0,'expression','historical objects','objects / items / treasures','objects、items 泛指物品；treasures 增加珍贵的评价色彩。'),(1,'expression','in person','in person','亲自、亲眼，区别于借助图片或媒体。'),(1,'expression','symbols of a country\'s history','symbols of history','历史的象征；文化类名词搭配。')])

# Additional entries are authored in the continuation modules below.
for module in ['author_b.py','author_c.py']:
    exec((ROOT/'scripts'/module).read_text(encoding='utf-8'))
first=json.loads((ROOT/'content/essay-01.json').read_text(encoding='utf-8'))
first.update(id='essay-01',title='少学习多锻炼',question='Parents should encourage children to spend less time studying and more time doing physical activities.\nTo what extent do you agree or disagree?',qzh='家长应该鼓励孩子减少学习时间，增加体育活动时间。你在多大程度上同意或不同意？',kind='同意与否',stance='承认运动重要，反对一刀切减少学习时间，主张提高效率。原题未限定盲目减时，方案本身也缩短实际学习时长，立场边界需更明确。',sourcePage=2)
first={k:first[k] for k in ['id','title','question','qzh','paragraphs','translations','kind','stance','structure','readerNotes','sourcePage']}
all_essays=[first]+ESSAYS
assert len(all_essays)==25
from enrich import enrich
all_essays=enrich(all_essays)
(ROOT/'content/essays.json').write_text(json.dumps(all_essays,ensure_ascii=False,indent=2),encoding='utf-8')
print('Authored',len(all_essays),'essays')
