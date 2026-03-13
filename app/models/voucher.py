"""凭证数据模型

存储从用友接口拉取的凭证数据，只存储关键字段：
- 科目代码和名称
- 制单日期
- 辅助核算信息
- 账簿信息
- 凭证摘要
- 借贷金额
"""

from sqlalchemy import Column, Integer, String, DateTime, Float, Index, DECIMAL
from sqlalchemy.sql import func
from app.models.base import Base


class VoucherData(Base):
    """凭证数据表 - 简化版本，只存储关键字段"""
    __tablename__ = "voucher_data"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # 公司信息
    company_code = Column(String(50), index=True, comment="公司编码")
    period = Column(String(10), index=True, comment="期间")
    
    # 科目信息
    accsubject_code = Column(String(50), comment="科目代码")
    accsubject_name = Column(String(200), comment="科目名称")
    
    # 时间信息
    maketime = Column(DateTime, comment="制单日期")
    
    # 辅助核算信息（只存储code是0018的）
    auxiliary_code = Column(String(50), comment="辅助核算代码")
    auxiliary_name = Column(String(200), comment="辅助核算名称")
    
    # 账簿信息
    accbook_name = Column(String(100), comment="账簿名称")
    displayname = Column(String(100), comment="展示名称（凭证字-凭证号）")
    
    # 凭证信息
    description = Column(String(500), comment="凭证摘要")
    
    # 金额信息（使用DECIMAL保证精度）
    debit_org = Column(DECIMAL(20, 2), comment="借方本币（账簿）")
    credit_org = Column(DECIMAL(20, 2), comment="贷方本币（账簿）")
    
    # 时间戳
    created_at = Column(DateTime, default=func.now(), comment="创建时间")
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), comment="更新时间")
    
    # 创建复合索引
    __table_args__ = (
        Index('idx_company_period', 'company_code', 'period'),
        Index('idx_maketime', 'maketime'),
    )
    
    def __repr__(self):
        return f"<VoucherData(company_code='{self.company_code}', accsubject_code='{self.accsubject_code}')>"