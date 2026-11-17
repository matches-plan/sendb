-- 디하 상담 연락처 정리 (2026-11-17 요청)
-- 채널톡 태그가 '디자이너'·'디자이너(파트너)'인 연락처와 사이트 회원 유형이 디자이너(partner·designer)인 연락처를 디하파트너즈 사업부로 옮긴다.
-- '기업'과 디자이너 태그가 함께 붙은 연락처는 보관(삭제) 처리한다. 지난 상담·딜·회사와의 연결은 끊는다.
-- 목록은 채널톡 내보내기 파일의 사용자 id로 만든 외부 번호(import:channel:contacts:…)만 담는다.
CREATE TEMP TABLE "_dihi_designer_ext" ("external_id" varchar(200) PRIMARY KEY);
--> statement-breakpoint
INSERT INTO "_dihi_designer_ext" VALUES
('import:channel:contacts:0062297b4a97987519ed32233daf96bee9e499fefe0b6c1f13bb2e8c6b3feed8'),
('import:channel:contacts:0389bd468841dd6844c7c2357011e267fb6dda23574848468a0a8a6376931ec5'),
('import:channel:contacts:03a29dc489167b88f4cc1a342af231c08160e44067c88db70f7f1805e12316d6'),
('import:channel:contacts:0594d6d877ac0249115c9a1d834df7f30785e7885af36202dcbe455a721db0a7'),
('import:channel:contacts:065c83ea918dff044c8579599429ad3b9e0ac631dad6470256f0e95a444f383f'),
('import:channel:contacts:06c4c225560a4ae692800c708849bf1755cb65a94d8ee816ac55fdf280871698'),
('import:channel:contacts:07dcc9b72358e6ccc217a9e58606768ad1ebe388c58da3e7f2faba75475a7f70'),
('import:channel:contacts:082f701df666ca0e2398f17ecccb4f6bc1bd59eefa67019d6736378864c3542c'),
('import:channel:contacts:09873c96d2f13b4f8f1902a998220bd4a7c6ec97fd5060a1d6a0e4edb8937b2b'),
('import:channel:contacts:0c1cfa3bb3ce0cfac926357a4cf508beba794c66f5711ae41eced975f49eea09'),
('import:channel:contacts:0d8722284185bcfb1752980b0177716c670c686521df1854a27266e6e86b594d'),
('import:channel:contacts:0e15c9be090253687abdae5dcfcf314c440abd3c173b789110fb2808294a7a69'),
('import:channel:contacts:10168bf68dd4b6dde0b9ceb019d743b9519a7ad2962ec67b4e04c495bc38a9e8'),
('import:channel:contacts:1470a709ae4eb648723aa0baef3d74e010013c62356c661434a12b7fc322203f'),
('import:channel:contacts:15670a9d63cbbafe33fede61ad773d4770354477b229b777906ca7615c057532'),
('import:channel:contacts:1661327cc9914d96c61296f543133d2b677119a71dafa98ff407773564bc329c'),
('import:channel:contacts:1be903bd93ad7f1834829cb2dfcc902f7e379abfa3a235e136c68dcd2069f61e'),
('import:channel:contacts:1ec27dfd60ec40112e1619cb2a5b566bf847f4c50ff430c763b94962e61a66d3'),
('import:channel:contacts:1f02a3466e56515c3f68851b6e3f523964723b82f2d6e093fef7f0d1ee46c52e'),
('import:channel:contacts:21745fd016631f6ef4ff7959f677999278f8a714a6bdea11896b0794437fb10d'),
('import:channel:contacts:2476eeea44d4fc7d85752469f9746052646dc8bc1fd4e698aafa4803f2a4fc55'),
('import:channel:contacts:25a525e200f1e168b5d081cd728d4e1a2577b39815ab0c1bf5449628a7873d0a'),
('import:channel:contacts:25c9ac6ff6b79e9c3c593b9cbb7e2857c5ad0d4489f9bfe12f1d9e5651c2b48b'),
('import:channel:contacts:26d3a7f8918769f39cb781133f5aa60052573dd7f7501f8ed4d71634989dcd8a'),
('import:channel:contacts:2789992be56ecffe8b6b6124fc8ffafeb9b14dc81bd7c654f0c58e96ca80de82'),
('import:channel:contacts:29424abf06ea680c210c6cf834b40f42197bd6e9994f7250db18f647fc0838a0'),
('import:channel:contacts:2b77c4ad64732f119ea3af24a49575dd161027635ec07afd6bdf84fd5c95771b'),
('import:channel:contacts:2d1a5781ef0ed39ac34105b5f2679f9f17c0adf231d99c3d17dc1f8ca715b2ed'),
('import:channel:contacts:3078c4f3d705c924bbc05d5463eb7b6a041394bf95292eb481002c18e81c8950'),
('import:channel:contacts:39ad7468491fb2727c33c224baf25a62dc8591c81d12f2b4ede08b0e5c7106a9'),
('import:channel:contacts:3aaac8e8873e79f407a91f3a373fef09e8fc2445afa8d1f4bd1d90c80b167f20'),
('import:channel:contacts:3b7622c56c13f0f64769267a12503f9dca95eafbf17b5e631e4ec24dea54cd8a'),
('import:channel:contacts:3d7b329b64297d2cba7a788ba0a7d96d959d9d0483ee2c50b8dcb6a9eaff7de2'),
('import:channel:contacts:4304c384bfa7d1dd77f8ad1fa23863c1eb4d5df8bbb02225a927a91b0f7cdb6a'),
('import:channel:contacts:43201a453d8de8b2d3d2662f830f6b27c48509088f3b073254edfd0309dfa644'),
('import:channel:contacts:432115e4c0a71af99ff7d5b60085676b07c86e900c52f80251fd2f291198260e'),
('import:channel:contacts:456c55838059547257c9cbc5960351f38c8330289eef7bdffa3962a1378f0f66'),
('import:channel:contacts:46c81f1f832259d42c2ede00070fba2216b18da00f48a9fdf9052d7c295c0483'),
('import:channel:contacts:47206cd7be72ec74eaeea2741c0d8e75d963da7e882074ec5821ff73c771bfca'),
('import:channel:contacts:4c5454766f2943d5caf6f59c6359385ddca91e0f22b13d3a7cc1064d7cff59ba'),
('import:channel:contacts:4daf4337360ec40a4a5a235d4addaacd51b9a937116bf44bb2ea2ab8256ff941'),
('import:channel:contacts:4f00febb115572add60c784ff00a1e4277f8ef24fc9033e7c508d192e3ea1461'),
('import:channel:contacts:503a8ef75e9fbbee9ae71a51a05c1a91cea8db2b55df0ce98559038423cc9a24'),
('import:channel:contacts:5149d4b39d0c557d8725b3f9d33304c135e61204a2b7aa2f48a4bb9292aa2ce2'),
('import:channel:contacts:51e36d7f49bcd58b1d725279fe2b7c27bede86a9a01110b06abfee2d56659833'),
('import:channel:contacts:52d200faba5df9a2eb876fd9511ffae03e19704e3d4fbe497c8bef8a222a1551'),
('import:channel:contacts:52f51e76643c11fc4db4424be0bbb0875cc86604bce5ee2f6245c10e92153628'),
('import:channel:contacts:5300fba00e8292224f90c248962356a1c799384a2781ae54c84e70423ba40151'),
('import:channel:contacts:53a61bbb7c4d1e1ef6fd5b11b47f3b4685f459a3df128dd5e5cd4bed56ef1997'),
('import:channel:contacts:53c4acaae084684abf39bcd2fa6e9287c5537199c015c64f63e021c17139d3ba'),
('import:channel:contacts:54c471b7bb4dc8471aaf45c452e6a96d250f5ccb67c06bab0847287c75a148a2'),
('import:channel:contacts:55300756f913f20f5ac136bff9e1aa334a2a5df22c2a6ce343f4ce3878c7d95a'),
('import:channel:contacts:57864c3b95ff6f1c1688f115100bed408a37a5e1536a7f8598f801ed7a9b7197'),
('import:channel:contacts:58988ef1c8ddc42e616816a74690a8568bd4bc9aaef854f842e6b44da259b224'),
('import:channel:contacts:5a64e4019603e1839fec18227c6c0549f6f7cbe7fe09c99de13a61aa4c2d1fa6'),
('import:channel:contacts:5d90abc341b680b5985b68467d4505fe7401a7d26c50ba8e612453cb3b6daee1'),
('import:channel:contacts:5fbf064a382911010a95937eff029e9b958b00f342eec99ff398ab296db789cb'),
('import:channel:contacts:65478f6dae293d0d12a3c25e5bac0ac17afa2c35fc65efdc2fe6a22be91c4920'),
('import:channel:contacts:65727392c3811e6a55a315e65cfe0e62237cd4e997165ff1be88caec55d6a934'),
('import:channel:contacts:65fb28ad9a4e2413517ece6ef17c5d40e69fe02224babccb30c3098c0289d434'),
('import:channel:contacts:6a488293c63cfd8677a8743209ce637948134523c2e37d08e04025d844b674d3'),
('import:channel:contacts:6a7d92d7e61db10cf762383cfd77a24f935291c00a82fce227a73fe9dd0fd99e'),
('import:channel:contacts:6b544c7ddbc0cfc706d2c31c8c8a53669fc4bf7da61f63ebf66d3732520c7056'),
('import:channel:contacts:6badbef7d347040bca5e60b2c207acff9ef7006add23ba61c27bdeb3f3c09588'),
('import:channel:contacts:722690f1083a596f06030a4eb829986ea2036c0eef6181b0a817482de1fe373c'),
('import:channel:contacts:758896bccf2983596399a63a3043c1142ffb853bd4dc239dfbd085d3de659848'),
('import:channel:contacts:760de369ae184664c719a63040a6d273349a1fc0ab876249a93ad5ffb864b643'),
('import:channel:contacts:76ee18dbca15eb87f66b4d68f244b7d92677f3816002165ece7543651daa2b9c'),
('import:channel:contacts:777ef8873b1ca997e2e1319031e09470643c72c4ee53857807a564a7bd1a6460'),
('import:channel:contacts:778ece4d6051dcd04af2981d299a2d892d854acdafe40b633af5d1fa7ae9b87b'),
('import:channel:contacts:78671ebd411c14188b64b9f8093704ea466c1cceccb79018b4db106b6e3b5d86'),
('import:channel:contacts:7b0dfa066a648328af0258469a6f5911cc6156c0140055314757e3134c699e78'),
('import:channel:contacts:7c8181bc3c9f9a003711c738b9d5cc7110c6bba8d8f40c2df71c274d17c1aea4'),
('import:channel:contacts:7d4e8bf9f1623afb03be37b25c2ef63a685209b0466f98f7b8aaf07bf1a4d849'),
('import:channel:contacts:7e3d56a9fd5b8cab92958625d6ed9051f1e6a974596b110f9f86c4961d5a4c08'),
('import:channel:contacts:7fe356e9c25d8251f27c5d99cfed5e945b71b89c927f16587b5677099ac9207e'),
('import:channel:contacts:828f9ea03f7525a76a5620d708dca8f54a7d66410e6856defaf28420edd5fa32'),
('import:channel:contacts:84c768c21bbf5997fd60c47c7d7ae478b64829875e95c80b48bfedfd3e3311d0'),
('import:channel:contacts:8502414e2d09ed7eb0b4bcb9b39124d763660f8c554721a23fcb1bb2a6082007'),
('import:channel:contacts:859cb33236de111a0379d1251adc4fe3b6f953636a1595f0efa14318e33d81fb'),
('import:channel:contacts:85e1108e497626da80b02d0e9c615c7bcca07615cf4a45e5d5393dd5682b7689'),
('import:channel:contacts:8746df2786367844b6481dc6654e81c0a0401460923cf80a8e81c9a5a9b6dc32'),
('import:channel:contacts:89bac2dd46c466d1df801dab081e0bb040cc226be051308b2fa97a3d224274e7'),
('import:channel:contacts:8a10882873daa75989d06ca95be08bc429b69c83c23f52ec5e72570838859fbe'),
('import:channel:contacts:8a7addbfe60df5a79a2df86e3759305b20607dc0d6a693bb93adf16e00327935'),
('import:channel:contacts:8c2767437a6fcf216758e79c440a29ee280366e4de6bb0fd5b439b0e16a718d3'),
('import:channel:contacts:8c86081dca7b8bc4a52b9362dd112528bea2752e239da93f73592f0a6f4908a7'),
('import:channel:contacts:8e38e56b4be929b364d64c776d5a45c24ae44befb2cba9671e4e7c2e235d15b8'),
('import:channel:contacts:91d1a2349188bb8a3222043940ce18947d79680fb75133ac832582b32a43b1fd'),
('import:channel:contacts:92a6f82bf65d9a2722f15be3275d03ccde8a49e5e36da275c99f76c9091e6621'),
('import:channel:contacts:958912ebd48633055b92bc9f9c3e71e113523a4c1b79dd2c27bb0edf0a552675'),
('import:channel:contacts:96ddd08ddfb963c25ed950df889f1ee7ac348b5c8c62d352dd9788c244ce242c'),
('import:channel:contacts:99c0fa51d324188e8b14f6b8f33f9d43d410bd634395005a62d5d58547f7c280'),
('import:channel:contacts:9d9d48038373196b31e4eb3c4dd26b07ba3c3061cae3a1402b4bd459007f60c9'),
('import:channel:contacts:9e37a1dc92fa1304b49df99b66c4c8a4565a5342f4c7c16ed902150022a1d0c9'),
('import:channel:contacts:9ebc602c0d452022f037a346e6480a61330d267a2abe2a084b6acd06d31117f1'),
('import:channel:contacts:9ee15aa66e928ae3ee74e016d163178e2085b0dec2b16a32f43e4522c3cda45b'),
('import:channel:contacts:9f848bdca9697e3e9ef79903158dede859dd732c5050af9dda58ae48039a0037'),
('import:channel:contacts:9fdd54ffdd7868e40262794897da7a5b08e9116c2b06ac9dfdd9400a6a665151'),
('import:channel:contacts:a06fba27436d1ef07b9a6ee3f559969875feb1f0be2c3ed42e72f3e4674e46c8'),
('import:channel:contacts:a0f774193e448254fe71cc53dfc588e36b5ca4d168d211828328eea342c3aee8'),
('import:channel:contacts:a3e2d1e79d02274e4c3d27cb5b517fe5a655d00b37c49a0370a0b3f9a0467673'),
('import:channel:contacts:a65efeffcf5b525e1f13f10cc243a1678ad0036ef77a4cc8e097770ba4360847'),
('import:channel:contacts:a78365a5f98e9050d249934be15e896fc848b01b492400deb324cc1873dff8c3'),
('import:channel:contacts:a836758e35675454e32c4da3b8551a899c1af8f00a69ce54ae25e2e64e554ff2'),
('import:channel:contacts:a8df163a7f956e4a8bfe4d01d096e2ecf386330728b6a188c740b4d8394611e0'),
('import:channel:contacts:aa5533e10f1e95ba01f5a3f9f9b96063bd5c93f2abd84ec4b3bbccbe39907e73'),
('import:channel:contacts:aaa5a1388092c8a11e70cb7d219548d1de9b2af0deaadfba63df30c3fbc8ef3a'),
('import:channel:contacts:aab853aace9c547f7861a4f8e0ce35d51aa52b8b30abdc44671b29178ca1fe15'),
('import:channel:contacts:aad75304febd5a93778281a615a5e647a6ae7f5955edcc1f5718d29a90afd57e'),
('import:channel:contacts:aeacd499bd1ad0a462fd54b6c7e005de6f73be2e943e6c385b1a1866b8df508a'),
('import:channel:contacts:b17294a06f0ffd8445d514ea72bb1acfc0aad5520f5f0b33131f0c786a0a194e'),
('import:channel:contacts:b4d9f30cf64f5a0aaed12a5240ae7d4295bd749fc86451ff620b8c6beb879c92'),
('import:channel:contacts:b4f7e63f95698afc74885a4152ba131a4b77ccb9de555c138318337a0b62fe83'),
('import:channel:contacts:b5362031dbf58939c18eba2c8fb4709260282a172c96d20beba911a0bc00451d'),
('import:channel:contacts:b846e3fcd4c4ae50329199f0385ff6d7c737b1dbe61ce1eefb1482eef026aaaf'),
('import:channel:contacts:b89361184b1c5f1d2ea09d19535cf6d2a7803891fbe4272cadf77785a1ee5854'),
('import:channel:contacts:b8c9eb71bc2a168b72d15ac4878b267a609640b787cdbe9d6545dde4b0397933'),
('import:channel:contacts:b8e43e1cc6dc25b258a08eeaa96f4c6df0e94626fc2b19c9db45c54a8d86a3aa'),
('import:channel:contacts:baa1045ce225f11a294400d9cdde24b1378cfccb71bc9d09572ce451d3722e8f'),
('import:channel:contacts:bb97c9843da006942962602da949d08439d5e1c1be6f018f5b815888df1f3bdd'),
('import:channel:contacts:bf648200c243e2fc9adac8b4f92fd9809f9a5b841315531d14e01460e780e718'),
('import:channel:contacts:c1793e0d36a9f7854acb516600ff81e9dcdc56a23b955c874a04010a640bc26a'),
('import:channel:contacts:c4a877a0691ffda06da78604e4a103fb65408335a1bcda89877b4b4d71e825b8'),
('import:channel:contacts:c637b487c89d7971149736f6366599eddc226a3ed9dbca2b1fe9b006c1ef1158'),
('import:channel:contacts:c8a1eac08f6fdadec96fe11df3ea027e0b0e1c6cce2d3b76b5ed97d7854f7164'),
('import:channel:contacts:c9ded29def5896d7bad4597265216d12259996ec2fa3d07ea1145082529c014f'),
('import:channel:contacts:cccdf4a0ec0a87c76fdc013d01c826c3d928d16889294f7e1d53e8c6b07942e8'),
('import:channel:contacts:cf7b8e21dc91454599736ab005b746e695fd745f36aa5ca29f86db5cb438d211'),
('import:channel:contacts:cfb31e1de0609062d9544517c96389396d314948e7864a4d94424fe4ca3c5065'),
('import:channel:contacts:d0fa7f041ce89c272fe6d4a7bf79eb2e79192eafd4286c07fadb3f3f009d1458'),
('import:channel:contacts:d18dfb83e55225d42c32bb3e17ccde30792e33c2421ebc3a006cf7404a1213bd'),
('import:channel:contacts:d249d41374f48fb7361c73a1157e3f4b100d5953551e097e6af6212b4c8bbfc3'),
('import:channel:contacts:d62bf8a83a1a45f403184a420f8ea868e8f5d813b820985a607ee08612b361f2'),
('import:channel:contacts:d6df7d133a633c20f7db401f60f478c96f19588751779c46d65bc33583bb7a71'),
('import:channel:contacts:d7e1d1ba4059529216c1df3f9c65675555081611c0f20f11b3a79204c647ca91'),
('import:channel:contacts:d98303fb5f6555251a0489e0fb0b2cd3227ec183f9bdef259399f4a1ccdd8b64'),
('import:channel:contacts:d9a9eb61f70e77b9a4aed02ff909617abad96fbc213e19eada4d36275282e084'),
('import:channel:contacts:dbdba00243e3cd9b8aabd9c63c6b459f239bdc99b9a3fe9a1a9f2bb205273460'),
('import:channel:contacts:dbee6e9a08f6c30a01fcc7c769507d2d6656105f68ff45a26269db39b027644a'),
('import:channel:contacts:de11408d7ce01f10e072e3b4e3e4182c2353da829370b76b9ea26c51e561cbb3'),
('import:channel:contacts:dea5e475db7980dd66773813920e4c1001fa84caa81ec7dc4921bdd10a1dbd98'),
('import:channel:contacts:e1197b02dc1efd4a8a271f8e6c7fdb3d7175dbaba73ff87d177497bf43f8fb60'),
('import:channel:contacts:e14db8243cc7167dd855745348baeb865d6379983caee1a63cfb5c9a2617c752'),
('import:channel:contacts:e1beb8edb5b1f458179a9c0f1e94115e4b74b422191a2edd8e7d1369aa46d87c'),
('import:channel:contacts:e34c2ccfc2c598b9e67a28777ba5b7ad2d8f0fc08cf7e111c440d207b415ce30'),
('import:channel:contacts:e5a253c853dab0d4c24e185d60b02f96d6724d095b1c8606d91dbd9e445452f3'),
('import:channel:contacts:e73016503e8a81cfb934ece78a0877d00b491921c93e8e24454ee9af984236af'),
('import:channel:contacts:e8bb06975bd75d13579a55eb49bd1c67a7cf3a06ba2d8cbcca9db6ed6c3eea9e'),
('import:channel:contacts:ec148fe451df0a0db328c103f4c4ff5b44bee5fa5940ee5d42c7c9907b3ccdfc'),
('import:channel:contacts:ee94c3db6ec464c01b8bad056af6151d94aef569113c181a0b234b820a960518'),
('import:channel:contacts:f2ec5a898a94c3a989dd3e22dbaf2e0b9e97036f543100995f21d7cda1bb27c8'),
('import:channel:contacts:f88b4bb7b32207c8bb5ae64871595968326c2d6a4d3b8ac47e9c96b453801c7a'),
('import:channel:contacts:f90638526eb77f4f47ebfa4ec7f985a148cf4274c77e6e7155b5fb3c8b556e5e'),
('import:channel:contacts:f9a71a9cb4428ae957be7509284004f92d784ee620910fc38c8bde3356c0cebf'),
('import:channel:contacts:fab942568042a450dfa0446918c89384b3be80310ca0ce8e35e70715699c8341'),
('import:channel:contacts:fada04a7bdaf5b5b69fc38db35190fb050066352977268e11a9be887e7bbfc8d'),
('import:channel:contacts:fcb2d9fff16ad8fd8f33fdddaa605acef1444a722a661adceae239a759b7600e'),
('import:channel:contacts:ffce7d153f77557f25bfa7773a9c3550ac59b261bf884a7c80e08c297092816f');
--> statement-breakpoint
CREATE TEMP TABLE "_dihi_both_ext" ("external_id" varchar(200) PRIMARY KEY);
--> statement-breakpoint
INSERT INTO "_dihi_both_ext" VALUES
('import:channel:contacts:3d4de0ddcdd1bd1c50b48c9b27666490957550c3eeefc8dab5532913b63602f1'),
('import:channel:contacts:4416b22c3c42ec3d56500f32c24c2b0e3b2679d82117f711fa6df48b97666f1a'),
('import:channel:contacts:4a5de34d91bb7178da01ae534668ae41e57145afc1f2c5c91700329bda1b73d5'),
('import:channel:contacts:7ccf0784f850e17c5f10d6a0a3784042d90a0b7aa82394ebfe8bc55f2c61f81e'),
('import:channel:contacts:cdb12d2785880c78ddcd2509fd3a08cb63dbe13821b69b6cb6173c48cf07a314'),
('import:channel:contacts:df7f8a1f2a519c5eefb4664b125fa3c3dd9715dc04f7c7099f16d3a6c160b9d1');
--> statement-breakpoint
UPDATE "crm_contacts" SET "archived_at" = now(), "version" = "version" + 1, "updated_at" = now()
WHERE "workspace_id" = (SELECT id FROM workspaces WHERE org_id = 'd3adb8d3-db1d-4fab-aac0-61c7f8644f13' AND name = '디하') AND "archived_at" IS NULL
  AND "external_id" IN (SELECT "external_id" FROM "_dihi_both_ext");
--> statement-breakpoint
CREATE TEMP TABLE "_dihi_move" AS
SELECT c."id" FROM "crm_contacts" c
WHERE c."workspace_id" = (SELECT id FROM workspaces WHERE org_id = 'd3adb8d3-db1d-4fab-aac0-61c7f8644f13' AND name = '디하') AND c."archived_at" IS NULL AND (SELECT id FROM workspaces WHERE org_id = 'd3adb8d3-db1d-4fab-aac0-61c7f8644f13' AND name = '디하파트너즈') IS NOT NULL
  AND c."external_id" NOT IN (SELECT "external_id" FROM "_dihi_both_ext")
  AND (c."external_id" IN (SELECT "external_id" FROM "_dihi_designer_ext")
       OR c."attributes"->>'userType' IN ('partner', 'designer')
       OR c."attributes"->>'siteMemberType' = 'partner')
  AND NOT EXISTS (SELECT 1 FROM "crm_contacts" p WHERE p."workspace_id" = (SELECT id FROM workspaces WHERE org_id = 'd3adb8d3-db1d-4fab-aac0-61c7f8644f13' AND name = '디하파트너즈') AND p."external_id" = c."external_id");
--> statement-breakpoint
DELETE FROM "crm_contact_companies" WHERE "contact_id" IN (SELECT "id" FROM "_dihi_move");
--> statement-breakpoint
UPDATE "crm_deals" SET "contact_id" = NULL WHERE "contact_id" IN (SELECT "id" FROM "_dihi_move");
--> statement-breakpoint
UPDATE "crm_activities" SET "contact_id" = NULL WHERE "contact_id" IN (SELECT "id" FROM "_dihi_move");
--> statement-breakpoint
UPDATE "customer_workflow_runs" SET "state" = 'cancelled', "reason" = '고객 사업부 이동으로 자동화를 중단했습니다.', "lease_id" = NULL, "lease_until" = NULL, "updated_at" = now()
WHERE "subject_contact_id" IN (SELECT "id" FROM "_dihi_move") AND "state" IN ('queued', 'running', 'waiting', 'retry');
--> statement-breakpoint
UPDATE "customer_workflow_runs" SET "subject_contact_id" = NULL WHERE "subject_contact_id" IN (SELECT "id" FROM "_dihi_move");
--> statement-breakpoint
UPDATE "crm_customer_events" SET "workspace_id" = (SELECT id FROM workspaces WHERE org_id = 'd3adb8d3-db1d-4fab-aac0-61c7f8644f13' AND name = '디하파트너즈') WHERE "contact_id" IN (SELECT "id" FROM "_dihi_move");
--> statement-breakpoint
UPDATE "crm_relationship_care" SET "workspace_id" = (SELECT id FROM workspaces WHERE org_id = 'd3adb8d3-db1d-4fab-aac0-61c7f8644f13' AND name = '디하파트너즈') WHERE "contact_id" IN (SELECT "id" FROM "_dihi_move");
--> statement-breakpoint
DELETE FROM "inbox_customer_reads" WHERE "contact_id" IN (SELECT "id" FROM "_dihi_move");
--> statement-breakpoint
UPDATE "customer_reply_contacts" SET "crm_contact_id" = NULL WHERE "crm_contact_id" IN (SELECT "id" FROM "_dihi_move");
--> statement-breakpoint
UPDATE "inbox_conversations" SET "contact_id" = NULL WHERE "contact_id" IN (SELECT "id" FROM "_dihi_move");
--> statement-breakpoint
UPDATE "crm_contacts" SET "workspace_id" = (SELECT id FROM workspaces WHERE org_id = 'd3adb8d3-db1d-4fab-aac0-61c7f8644f13' AND name = '디하파트너즈'), "version" = "version" + 1, "updated_at" = now()
WHERE "id" IN (SELECT "id" FROM "_dihi_move");
--> statement-breakpoint
DROP TABLE "_dihi_move";
--> statement-breakpoint
DROP TABLE "_dihi_designer_ext";
--> statement-breakpoint
DROP TABLE "_dihi_both_ext";
