<template>
  <div class="perf-page">
    <!-- 顶部导航 -->
    <header class="perf-header">
      <button class="back-btn" @click="goBack">‹</button>
      <h3>📊 绩效明细</h3>
      <div class="header-right">
        <button class="hdr-btn" @click="prevMonth">‹ 上月</button>
        <span class="month-label">{{ curLabel }}</span>
        <button class="hdr-btn" @click="nextMonth">下月 ›</button>
        <button class="hdr-btn primary" @click="handleSave" :disabled="saving">
          {{ saving ? '保存中…' : '💾 保存' }}
        </button>
      </div>
    </header>

    <!-- 月度考核表 -->
    <div class="perf-body">
      <div class="perf-sheet">
        <h2 class="sheet-title">{{ curYear }}年 月度考核表</h2>

        <!-- 被考核人信息 -->
        <div class="info-row">
          <div class="info-field">
            <label>被考核人姓名</label>
            <input v-model="form.employee_name" placeholder="姓名" />
          </div>
          <div class="info-field">
            <label>部 门</label>
            <input v-model="form.department" placeholder="部门" />
          </div>
          <div class="info-field">
            <label>岗 位</label>
            <input v-model="form.position" placeholder="岗位" />
          </div>
        </div>

        <!-- 考核表 -->
        <div class="table-wrap">
          <table class="perf-table">
            <thead>
              <tr>
                <th style="width:80px">考核维度</th>
                <th style="width:60px">牵引点</th>
                <th style="width:200px">考核指标</th>
                <th style="width:60px">分数</th>
                <th style="width:180px">自评得分</th>
                <th style="width:70px">上级评分</th>
                <th style="width:80px">最高主管评分</th>
              </tr>
            </thead>
            <tbody>
              <!-- 财务维度 -->
              <tr class="dim-row">
                <td class="dim-cell" rowspan="3">财务<br />45分</td>
                <td class="num-cell">1</td>
                <td class="indicator-cell">部门销售目标达成率<br /><small>(当期实际销售额/当期计划销售额)*100%，少5%扣1分</small></td>
                <td class="score-cell">10</td>
                <td class="score-self-cell">
                  <input type="number" class="score-input" @focus="selectInput" v-model.number="scores[1].self" min="0" max="10" />
                  <input class="score-note" placeholder="评分说明..." v-model="scores[1].self_note" />
                </td>
                <td><input type="number" class="score-input" @focus="selectInput" v-model.number="scores[1].sup" min="0" max="10" /></td>
                <td><input type="number" class="score-input" @focus="selectInput" v-model.number="scores[1].mgr" min="0" max="10" /></td>
              </tr>
              <tr class="dim-row">
                <td class="num-cell">2</td>
                <td class="indicator-cell">个人销售目标达成率<br /><small>(当期实际销售额/当期计划销售额)*100%，少5%扣1分</small></td>
                <td class="score-cell">20</td>
                <td class="score-self-cell">
                  <input type="number" class="score-input" @focus="selectInput" v-model.number="scores[2].self" min="0" max="20" />
                  <input class="score-note" placeholder="评分说明..." v-model="scores[2].self_note" />
                </td>
                <td><input type="number" class="score-input" @focus="selectInput" v-model.number="scores[2].sup" min="0" max="20" /></td>
                <td><input type="number" class="score-input" @focus="selectInput" v-model.number="scores[2].mgr" min="0" max="20" /></td>
              </tr>
              <tr class="dim-row">
                <td class="num-cell">3</td>
                <td class="indicator-cell">回款率<br /><small>回款率100%，每少5%扣2分</small></td>
                <td class="score-cell">15</td>
                <td class="score-self-cell">
                  <input type="number" class="score-input" @focus="selectInput" v-model.number="scores[3].self" min="0" max="15" />
                  <input class="score-note" placeholder="评分说明..." v-model="scores[3].self_note" />
                </td>
                <td><input type="number" class="score-input" @focus="selectInput" v-model.number="scores[3].sup" min="0" max="15" /></td>
                <td><input type="number" class="score-input" @focus="selectInput" v-model.number="scores[3].mgr" min="0" max="15" /></td>
              </tr>
              <!-- 财务小计 -->
              <tr class="subtotal-row">
                <td colspan="3" class="subtotal-label">财务 小计</td>
                <td class="score-cell">45</td>
                <td class="subtotal-val">{{ dimSubtotals.finance.self }}</td>
                <td class="subtotal-val">{{ dimSubtotals.finance.sup }}</td>
                <td class="subtotal-val">{{ dimSubtotals.finance.mgr }}</td>
              </tr>

              <!-- 客户维度 -->
              <tr class="dim-row">
                <td class="dim-cell" rowspan="2">客户<br />30分</td>
                <td class="num-cell">4</td>
                <td class="indicator-cell">高端产品(OCXO,差分等)和新产品开发<br /><small>注册1家有效客户得2分（以CRM平台注册为准）<br/>有效客户（含：客户用料、竞争对手、进入机会）</small></td>
                <td class="score-cell">15</td>
                <td class="score-self-cell">
                  <input type="number" class="score-input" @focus="selectInput" v-model.number="scores[4].self" min="0" max="15" />
                  <input class="score-note" placeholder="评分说明..." v-model="scores[4].self_note" />
                </td>
                <td><input type="number" class="score-input" @focus="selectInput" v-model.number="scores[4].sup" min="0" max="15" /></td>
                <td><input type="number" class="score-input" @focus="selectInput" v-model.number="scores[4].mgr" min="0" max="15" /></td>
              </tr>
              <tr class="dim-row">
                <td class="num-cell">5</td>
                <td class="indicator-cell">新客户开发<br /><small>以成交下单为准，每1家客户得5分</small></td>
                <td class="score-cell">15</td>
                <td class="score-self-cell">
                  <input type="number" class="score-input" @focus="selectInput" v-model.number="scores[5].self" min="0" max="15" />
                  <input class="score-note" placeholder="评分说明..." v-model="scores[5].self_note" />
                </td>
                <td><input type="number" class="score-input" @focus="selectInput" v-model.number="scores[5].sup" min="0" max="15" /></td>
                <td><input type="number" class="score-input" @focus="selectInput" v-model.number="scores[5].mgr" min="0" max="15" /></td>
              </tr>
              <!-- 客户小计 -->
              <tr class="subtotal-row">
                <td colspan="3" class="subtotal-label">客户 小计</td>
                <td class="score-cell">30</td>
                <td class="subtotal-val">{{ dimSubtotals.customer.self }}</td>
                <td class="subtotal-val">{{ dimSubtotals.customer.sup }}</td>
                <td class="subtotal-val">{{ dimSubtotals.customer.mgr }}</td>
              </tr>

              <!-- 内部运营维度 -->
              <tr class="dim-row">
                <td class="dim-cell" rowspan="2">内部运营<br />25分</td>
                <td class="num-cell">6</td>
                <td class="indicator-cell">个人库存控制<br /><small>个人库存情况异常严重的酌情扣分</small></td>
                <td class="score-cell">10</td>
                <td class="score-self-cell">
                  <input type="number" class="score-input" @focus="selectInput" v-model.number="scores[6].self" min="0" max="10" />
                  <input class="score-note" placeholder="评分说明..." v-model="scores[6].self_note" />
                </td>
                <td><input type="number" class="score-input" @focus="selectInput" v-model.number="scores[6].sup" min="0" max="10" /></td>
                <td><input type="number" class="score-input" @focus="selectInput" v-model.number="scores[6].mgr" min="0" max="10" /></td>
              </tr>
              <tr class="dim-row">
                <td class="num-cell">7</td>
                <td class="indicator-cell">部门协作<br /><small>每月请经理陪同拜访或跟进客户，每1家得4分；<br/>销售周会分享（有效市场信息、案例)每1次得2分;<br/>资深销售人员传帮带、传授经验每1次得2分;</small></td>
                <td class="score-cell">15</td>
                <td class="score-self-cell">
                  <input type="number" class="score-input" @focus="selectInput" v-model.number="scores[7].self" min="0" max="15" />
                  <input class="score-note" placeholder="评分说明..." v-model="scores[7].self_note" />
                </td>
                <td><input type="number" class="score-input" @focus="selectInput" v-model.number="scores[7].sup" min="0" max="15" /></td>
                <td><input type="number" class="score-input" @focus="selectInput" v-model.number="scores[7].mgr" min="0" max="15" /></td>
              </tr>
              <!-- 内部运营小计 -->
              <tr class="subtotal-row">
                <td colspan="3" class="subtotal-label">内部运营 小计</td>
                <td class="score-cell">25</td>
                <td class="subtotal-val">{{ dimSubtotals.ops.self }}</td>
                <td class="subtotal-val">{{ dimSubtotals.ops.sup }}</td>
                <td class="subtotal-val">{{ dimSubtotals.ops.mgr }}</td>
              </tr>

              <!-- 学习成长（加分项） -->
              <tr class="dim-row bonus-row">
                <td class="dim-cell" rowspan="3">学习成长<br />加分项<br />10-30分</td>
                <td class="num-cell">8</td>
                <td class="indicator-cell">知识输出<br /><small>1).担任内部培训讲师、输出文档或课件(根据调查问卷反馈加 5-10分）<br/> 90分以上100%（10分）、80-90分70%（7分）、70分-80分50%（5分）70分以下不加分<br/>2) 参与月末周六上课学习积极度加1-5分 （回答问题、主动分享，以课堂个人得分前五名进行阶梯式加分）<br/>3)公司平台知识库输出有价值的共享文档（2-5分/篇）</small></td>
                <td class="score-cell">1-10</td>
                <td class="score-self-cell">
                  <input type="number" class="score-input" @focus="selectInput" v-model.number="scores[8].self" min="0" max="10" />
                  <input class="score-note" placeholder="评分说明..." v-model="scores[8].self_note" />
                </td>
                <td><input type="number" class="score-input" @focus="selectInput" v-model.number="scores[8].sup" min="0" max="10" /></td>
                <td><input type="number" class="score-input" @focus="selectInput" v-model.number="scores[8].mgr" min="0" max="10" /></td>
              </tr>
              <tr class="dim-row bonus-row">
                <td class="num-cell">9</td>
                <td class="indicator-cell">管理优化<br /><small>个人提报合理的改进建议，并书面输出解决方案与操作流程，由各部门领导、管理部共同审核确认（1-10分）</small></td>
                <td class="score-cell">1-10</td>
                <td class="score-self-cell">
                  <input type="number" class="score-input" @focus="selectInput" v-model.number="scores[9].self" min="0" max="10" />
                  <input class="score-note" placeholder="评分说明..." v-model="scores[9].self_note" />
                </td>
                <td><input type="number" class="score-input" @focus="selectInput" v-model.number="scores[9].sup" min="0" max="10" /></td>
                <td><input type="number" class="score-input" @focus="selectInput" v-model.number="scores[9].mgr" min="0" max="10" /></td>
              </tr>
              <tr class="dim-row bonus-row">
                <td class="num-cell">10</td>
                <td class="indicator-cell">团队贡献<br /><small>1）非新媒体部门人员出镜直播5分、短视频拍摄3分、投稿被采用2分，月度最高10分<br/>2）为公司引荐优秀人才：入职2分、成功转正5分<br/>3）客户端按要求收集成功案例素材2-5分/条 <br/>4）其它对公司、部门团队建设贡献 1-10分/条</small></td>
                <td class="score-cell">1-10</td>
                <td class="score-self-cell">
                  <input type="number" class="score-input" @focus="selectInput" v-model.number="scores[10].self" min="0" max="10" />
                  <input class="score-note" placeholder="评分说明..." v-model="scores[10].self_note" />
                </td>
                <td><input type="number" class="score-input" @focus="selectInput" v-model.number="scores[10].sup" min="0" max="10" /></td>
                <td><input type="number" class="score-input" @focus="selectInput" v-model.number="scores[10].mgr" min="0" max="10" /></td>
              </tr>
              <!-- 学习成长小计 -->
              <tr class="subtotal-row bonus-st">
                <td colspan="3" class="subtotal-label">学习成长 小计</td>
                <td class="score-cell">10-30</td>
                <td class="subtotal-val">{{ dimSubtotals.growth.self }}</td>
                <td class="subtotal-val">{{ dimSubtotals.growth.sup }}</td>
                <td class="subtotal-val">{{ dimSubtotals.growth.mgr }}</td>
              </tr>

              <!-- 减分项 -->
              <tr class="deduct-head">
                <td colspan="7" class="deduct-label">
                  <div class="deduct-head-row">
                    <span>减分项</span>
                    <small>工作失误：工作过程中，出现严重失误，对公司及团队造成严重影响（视具体情况扣0-100分）</small>
                    <button class="add-deduct-btn" @click="addDeduction">＋ 添加</button>
                  </div>
                </td>
              </tr>
              <tr v-for="(d, di) in deductions" :key="di" class="deduct-row">
                <td colspan="2" class="deduct-num">{{ di + 1 }}</td>
                <td class="deduct-desc">
                  <input v-model="d.desc" placeholder="工作失误描述" class="deduct-input" />
                </td>
                <td class="score-cell">-</td>
                <td><input type="number" class="score-input deduct-score" @focus="selectInput" v-model.number="d.self" min="0" /></td>
                <td><input type="number" class="score-input deduct-score" @focus="selectInput" v-model.number="d.sup" min="0" /></td>
                <td>
                  <div class="deduct-actions">
                    <input type="number" class="score-input deduct-score" @focus="selectInput" v-model.number="d.mgr" min="0" />
                    <button class="deduct-del" @click="deductions.splice(di, 1)">×</button>
                  </div>
                </td>
              </tr>
              <tr v-if="!deductions.length" class="deduct-row">
                <td colspan="7" class="deduct-empty">无减分项（点击「＋ 添加」添加）</td>
              </tr>

              <!-- 合计 -->
              <tr class="total-row">
                <td colspan="3" class="total-label">合 计</td>
                <td class="score-cell">{{ totalFullMark }}</td>
                <td class="total-val">{{ totals.self }}</td>
                <td class="total-val">{{ totals.sup }}</td>
                <td class="total-val">{{ totals.mgr }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="save-bar">
          <button class="save-btn" @click="handleSave" :disabled="saving">
            {{ saving ? '保存中…' : '💾 保存' }}
          </button>
          <span class="save-tip" v-if="saved">✅ 已保存（{{ savedAt }}）</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { showToast } from "vant";
import { http } from "../utils/api.js";

const route = useRoute();
const router = useRouter();
const isStandalone = route.query.standalone === "1";

// 当前月份
const now = new Date();
const curYear = ref(now.getFullYear());
const curMonth = ref(now.getMonth() + 1);
const curLabel = computed(() => `${curYear.value}年${String(curMonth.value).padStart(2, '0')}月`);
const monthKey = computed(() => `${curYear.value}-${String(curMonth.value).padStart(2, '0')}`);
const saving = ref(false);
const saved = ref(false);
const savedAt = ref("");

const form = reactive({
  employee_name: "",
  department: "",
  position: "",
});

// 10个指标的评分
const scores = reactive({});
for (let i = 1; i <= 10; i++) {
  scores[i] = { self: 0, sup: 0, mgr: 0, self_note: "" };
}

const deductions = reactive([]);

// 维度分组
const dims = {
  finance: [1, 2, 3],
  customer: [4, 5],
  ops: [6, 7],
  growth: [8, 9, 10],
};

const dimSubtotals = computed(() => {
  const r = {};
  for (const [key, items] of Object.entries(dims)) {
    const self = items.reduce((s, i) => s + (scores[i]?.self || 0), 0);
    const sup = items.reduce((s, i) => s + (scores[i]?.sup || 0), 0);
    const mgr = items.reduce((s, i) => s + (scores[i]?.mgr || 0), 0);
    r[key] = { self, sup, mgr };
  }
  return r;
});

const deductTotal = computed(() => {
  const self = deductions.reduce((s, d) => s + (d.self || 0), 0);
  const sup = deductions.reduce((s, d) => s + (d.sup || 0), 0);
  const mgr = deductions.reduce((s, d) => s + (d.mgr || 0), 0);
  return { self, sup, mgr };
});

const totals = computed(() => {
  const base = dimSubtotals.value;
  const self = base.finance.self + base.customer.self + base.ops.self + base.growth.self - deductTotal.value.self;
  const sup = base.finance.sup + base.customer.sup + base.ops.sup + base.growth.sup - deductTotal.value.sup;
  const mgr = base.finance.mgr + base.customer.mgr + base.ops.mgr + base.growth.mgr - deductTotal.value.mgr;
  return { self: Math.max(0, self), sup: Math.max(0, sup), mgr: Math.max(0, mgr) };
});

const totalFullMark = computed(() => {
  return "100+加分";
});

function selectInput(e) {
  e.target.select();
}

function addDeduction() {
  deductions.push({ desc: "", self: 0, sup: 0, mgr: 0 });
}

// 加载数据
async function loadData() {
  try {
    const r = await http.get("/performance/reviews", { params: { month: monthKey.value } });
    const list = r.data?.data || [];
    if (list.length) {
      const item = list[0];
      form.employee_name = item.employee_name || "";
      form.department = item.department || "";
      form.position = item.position || "";
      const savedScores = typeof item.scores === "string" ? JSON.parse(item.scores) : (item.scores || {});
      for (let i = 1; i <= 10; i++) {
        const s = savedScores[i] || {};
        scores[i].self = s.self || 0;
        scores[i].sup = s.sup || 0;
        scores[i].mgr = s.mgr || 0;
        scores[i].self_note = s.self_note || "";
      }
      const savedDed = typeof item.deductions === "string" ? JSON.parse(item.deductions) : (item.deductions || []);
      deductions.length = 0;
      for (const d of savedDed) {
        deductions.push({ desc: d.desc || "", self: d.self || 0, sup: d.sup || 0, mgr: d.mgr || 0 });
      }
    } else {
      // 该月无记录 → 清空表单
      form.employee_name = "";
      form.department = "";
      form.position = "";
      for (let i = 1; i <= 10; i++) {
        scores[i].self = 0;
        scores[i].sup = 0;
        scores[i].mgr = 0;
        scores[i].self_note = "";
      }
      deductions.length = 0;
    }
  } catch {}
}

let saveTimer = null;
watch([curYear, curMonth], () => {
  saved.value = false;
  savedAt.value = "";
  loadData();
});

async function handleSave() {
  saving.value = true;
  try {
    // 查是否已有记录
    const r = await http.get("/performance/reviews", { params: { month: monthKey.value } });
    const list = r.data?.data || [];
    const payload = {
      month: monthKey.value,
      employee_name: form.employee_name,
      department: form.department,
      position: form.position,
      scores: JSON.parse(JSON.stringify(scores)),
      deductions: JSON.parse(JSON.stringify(deductions)),
      total_score: totals.value.self,
    };
    if (list.length) {
      await http.put(`/performance/reviews/${list[0].id}`, payload);
    } else {
      await http.post("/performance/reviews", payload);
    }
    saved.value = true;
    const d = new Date();
    savedAt.value = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
    showToast("✅ 保存成功");
  } catch (e) {
    showToast("保存失败: " + (e.message || ""));
  } finally {
    saving.value = false;
  }
}

function prevMonth() {
  if (curMonth.value === 1) {
    curMonth.value = 12;
    curYear.value--;
  } else {
    curMonth.value--;
  }
}

function nextMonth() {
  if (curMonth.value === 12) {
    curMonth.value = 1;
    curYear.value++;
  } else {
    curMonth.value++;
  }
}

function goBack() {
  if (isStandalone) {
    window.close();
  } else {
    router.back();
  }
}

onMounted(() => {
  loadData();
});
</script>

<style scoped>
.perf-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f5f5f5;
  overflow: hidden;
}

.perf-header {
  display: flex;
  align-items: center;
  padding: 0 16px;
  height: 48px;
  background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%);
  flex-shrink: 0;
  z-index: 10;
  gap: 12px;
}
.perf-header h3 {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  color: #2e7d32;
  flex-shrink: 0;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}
.hdr-btn {
  padding: 5px 12px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  border: 1px solid rgba(0,0,0,0.08);
  background: rgba(255,255,255,0.7);
  color: #2e7d32;
  font-family: inherit;
  white-space: nowrap;
  transition: all 0.15s;
}
.hdr-btn:hover { background: #fff; border-color: #2e7d32; }
.hdr-btn.primary {
  background: #2e7d32;
  color: #fff;
  border-color: #2e7d32;
}
.hdr-btn.primary:hover { background: #1b5e20; }
.hdr-btn:disabled { opacity: 0.6; cursor: default; }
.month-label {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  min-width: 90px;
  text-align: center;
}
.back-btn {
  background: transparent;
  border: 1px solid rgba(0,0,0,0.08);
  border-radius: 4px;
  color: #2e7d32;
  font-size: 20px;
  cursor: pointer;
  padding: 2px 8px;
  line-height: 1;
  font-family: inherit;
}

/* 主体 */
.perf-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  justify-content: center;
}
.perf-sheet {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.06);
  padding: 24px 20px 20px;
  max-width: 1000px;
  width: 100%;
  align-self: flex-start;
}

.sheet-title {
  font-size: 20px;
  font-weight: 700;
  text-align: center;
  color: #333;
  margin: 0 0 16px;
}

/* 被考核人信息 */
.info-row {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}
.info-field {
  display: flex;
  align-items: center;
  gap: 6px;
}
.info-field label {
  font-size: 13px;
  color: #555;
  white-space: nowrap;
  font-weight: 500;
}
.info-field input {
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  padding: 6px 10px;
  font-size: 13px;
  font-family: inherit;
  outline: none;
  width: 120px;
  background: #fafafa;
}
.info-field input:focus {
  border-color: #2e7d32;
  background: #fff;
}

/* 表格容器 */
.table-wrap {
  overflow-x: auto;
}
.perf-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  min-width: 780px;
}
.perf-table th {
  background: #e8f5e9;
  color: #2e7d32;
  font-weight: 600;
  padding: 8px 6px;
  text-align: center;
  border: 1px solid #c8e6c9;
  font-size: 11px;
}
.perf-table td {
  border: 1px solid #e0e0e0;
  padding: 4px;
  text-align: center;
  vertical-align: middle;
}

.dim-cell {
  font-weight: 600;
  color: #333;
  background: #f9fbe7;
  font-size: 12px;
  min-width: 60px;
}
.num-cell {
  font-weight: 600;
  color: #555;
  background: #fafafa;
}
.indicator-cell {
  text-align: left !important;
  padding: 6px 10px !important;
  color: #333;
  font-size: 12px;
  line-height: 1.5;
}
.indicator-cell small {
  font-size: 10px;
  color: #999;
  display: block;
  line-height: 1.4;
}
.score-cell {
  font-weight: 600;
  color: #2e7d32;
  background: #f1f8e9;
  font-size: 13px;
}

.score-input {
  width: 52px;
  padding: 4px;
  border: 1px solid #e0e0e0;
  border-radius: 3px;
  font-size: 12px;
  text-align: center;
  font-family: inherit;
  outline: none;
  background: #fafafa;
}
.score-input:focus {
  border-color: #2e7d32;
  background: #fff;
}
.score-input.deduct-score {
  width: 46px;
}
.score-self-cell {
  min-width: 160px;
}
.score-note {
  display: block;
  width: calc(100% - 8px);
  margin: 4px auto 0;
  border: none;
  border-bottom: 1px dashed #e0e0e0;
  padding: 2px 4px;
  font-size: 10px;
  font-family: inherit;
  outline: none;
  background: transparent;
  color: #666;
  text-align: left;
  line-height: 1.4;
  transition: border-color 0.15s;
  white-space: normal;
  word-break: break-all;
  resize: none;
}
.score-note:focus {
  border-bottom-color: #2e7d32;
  color: #333;
}
.score-note::placeholder {
  color: #ccc;
}

.dim-row td:first-child {
  background: #f1f8e9;
}
.dim-row.bonus-row td:first-child {
  background: #fff8e1;
}
.dim-row.bonus-row .indicator-cell small {
  color: #a68b00;
}

.subtotal-row td {
  background: #e8f5e9;
  font-weight: 600;
}
.subtotal-label {
  text-align: right !important;
  padding-right: 10px !important;
  color: #2e7d32;
  font-size: 12px;
}
.subtotal-val {
  font-weight: 700;
  color: #1b5e20;
  font-size: 14px;
}
.bonus-st td {
  background: #fff8e1;
}
.bonus-st .subtotal-label {
  color: #a68b00;
}
.bonus-st .subtotal-val {
  color: #8d6e00;
}

/* 减分项 */
.deduct-head td {
  background: #ffebee;
  padding: 6px 10px !important;
  text-align: left !important;
}
.deduct-label {
  font-weight: 600;
  color: #c62828;
  font-size: 13px;
}
.deduct-head-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.deduct-head-row small {
  font-weight: 400;
  font-size: 10px;
  color: #e53935;
  flex: 1;
  min-width: 200px;
  line-height: 1.4;
}
.add-deduct-btn {
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 10px;
  border: 1px solid #ef9a9a;
  background: #fff;
  color: #c62828;
  cursor: pointer;
  font-family: inherit;
}
.add-deduct-btn:hover {
  background: #ffebee;
}
.deduct-row td {
  background: #fff5f5;
}
.deduct-num {
  font-weight: 600;
  color: #999;
  font-size: 11px;
}
.deduct-desc {
  text-align: left !important;
  padding: 4px 8px !important;
}
.deduct-input {
  width: 100%;
  border: 1px solid #e0e0e0;
  border-radius: 3px;
  padding: 4px 6px;
  font-size: 11px;
  font-family: inherit;
  outline: none;
  background: #fff;
}
.deduct-input:focus {
  border-color: #e53935;
}
.deduct-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
}
.deduct-del {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: #e53935;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  flex-shrink: 0;
}
.deduct-del:hover {
  background: #ffebee;
}
.deduct-empty {
  color: #bbb;
  font-size: 11px;
  padding: 10px !important;
}

/* 合计 */
.total-row td {
  background: #e8f5e9;
  font-weight: 700;
  padding: 8px 4px !important;
}
.total-label {
  text-align: right !important;
  padding-right: 12px !important;
  color: #1b5e20;
  font-size: 14px;
}
.total-val {
  font-weight: 700;
  color: #1b5e20;
  font-size: 16px;
}

/* 保存栏 */
.save-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #f0f0f0;
}
.save-btn {
  padding: 8px 32px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  background: #2e7d32;
  color: #fff;
  font-family: inherit;
  transition: all 0.15s;
}
.save-btn:hover { background: #1b5e20; }
.save-btn:disabled { opacity: 0.6; cursor: default; }
.save-tip {
  font-size: 12px;
  color: #2e7d32;
}

@media (max-width: 768px) {
  .perf-header {
    flex-wrap: wrap;
    height: auto;
    padding: 6px 10px;
    gap: 4px;
  }
  .header-right { width: 100%; justify-content: center; }
  .perf-body { padding: 8px; }
  .perf-sheet { padding: 12px 8px; }
  .sheet-title { font-size: 16px; }
  .info-row { flex-direction: column; gap: 6px; }
  .info-field input { width: 100%; }
  .score-input { width: 40px; font-size: 11px; }
  .score-input.deduct-score { width: 36px; }
  .perf-table { min-width: 600px; font-size: 10px; }
  .indicator-cell small { font-size: 9px; }
}
</style>
